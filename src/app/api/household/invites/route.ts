import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { householdInvites } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { createInviteSchema } from "@/lib/schemas/auth";

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireAdmin();
  const input = createInviteSchema.parse(await req.json().catch(() => ({})));

  const token = generateToken();
  const [invite] = await db
    .insert(householdInvites)
    .values({
      householdId: ctx.householdId,
      tokenHash: hashToken(token),
      role: input.role,
      invitedBy: ctx.user.id,
      expiresAt: new Date(Date.now() + 7 * 86400_000), // 7 days
    })
    .returning({ id: householdInvites.id, expiresAt: householdInvites.expiresAt });

  // The plain token is returned exactly once; only its hash is stored.
  return NextResponse.json({ ...invite, token }, { status: 201 });
});

export const GET = apiHandler(async () => {
  const ctx = await requireAdmin();
  const invites = await db
    .select({
      id: householdInvites.id,
      role: householdInvites.role,
      invitedBy: householdInvites.invitedBy,
      expiresAt: householdInvites.expiresAt,
      createdAt: householdInvites.createdAt,
    })
    .from(householdInvites)
    .where(
      and(
        eq(householdInvites.householdId, ctx.householdId),
        isNull(householdInvites.usedAt),
        gt(householdInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(householdInvites.createdAt));
  return NextResponse.json({ items: invites });
});
