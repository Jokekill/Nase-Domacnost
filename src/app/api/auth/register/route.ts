import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import {
  householdInvites,
  householdMembers,
  households,
  users,
} from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/passwords";
import { createSession } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";
import { enforceRateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/schemas/auth";

export const POST = apiHandler(async (req: NextRequest) => {
  enforceRateLimit(`register:${req.headers.get("x-forwarded-for") ?? "local"}`);
  const input = registerSchema.parse(await req.json());

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  if (existing.length > 0) {
    throw new ApiError("conflict", "Účet s tímto e-mailem už existuje.");
  }

  const anyUser = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = anyUser.length === 0;

  const passwordHash = await hashPassword(input.password);
  const userId = uuidv7();

  if (isFirstUser) {
    // First user founds the household and becomes admin (ARCHITECTURE.md §1.3).
    const householdId = uuidv7();
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        lastModifiedBy: userId,
      });
      await tx.insert(households).values({
        id: householdId,
        name: input.householdName ?? "Naše domácnost",
        lastModifiedBy: userId,
      });
      await tx.insert(householdMembers).values({
        householdId,
        userId,
        role: "admin",
      });
    });
  } else {
    if (!input.inviteToken) {
      throw new ApiError(
        "forbidden",
        "Registrace je možná jen s pozvánkou do domácnosti.",
      );
    }
    const tokenHash = hashToken(input.inviteToken);
    const invites = await db
      .select()
      .from(householdInvites)
      .where(
        and(
          eq(householdInvites.tokenHash, tokenHash),
          isNull(householdInvites.usedAt),
          gt(householdInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const invite = invites[0];
    if (!invite) {
      throw new ApiError("forbidden", "Pozvánka je neplatná nebo vypršela.");
    }
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        lastModifiedBy: userId,
      });
      await tx.insert(householdMembers).values({
        householdId: invite.householdId,
        userId,
        role: invite.role,
      });
      await tx
        .update(householdInvites)
        .set({ usedAt: new Date() })
        .where(eq(householdInvites.id, invite.id));
    });
  }

  await createSession(userId);
  return NextResponse.json({ id: userId }, { status: 201 });
});
