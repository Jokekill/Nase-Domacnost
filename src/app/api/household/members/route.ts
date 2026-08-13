import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { householdMembers, users } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const members = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, ctx.householdId));
  return NextResponse.json({ items: members });
});
