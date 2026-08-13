import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { householdMembers, households } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { getSessionUser, type SessionUser } from "./session";

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError("unauthorized", "Přihlášení je vyžadováno.");
  return user;
}

export type HouseholdContext = {
  user: SessionUser;
  householdId: string;
  role: "admin" | "member";
};

/**
 * Household data is ALWAYS scoped by the membership row — never by an id
 * coming from the request (docs/ARCHITECTURE.md §2.1).
 */
export async function requireHousehold(
  user?: SessionUser,
): Promise<HouseholdContext> {
  const u = user ?? (await requireUser());
  const rows = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, u.id))
    .limit(1);
  const m = rows[0];
  if (!m) throw new ApiError("forbidden", "Nejsi členem žádné domácnosti.");
  return { user: u, householdId: m.householdId, role: m.role };
}

export async function requireAdmin(): Promise<HouseholdContext> {
  const ctx = await requireHousehold();
  if (ctx.role !== "admin") {
    throw new ApiError("forbidden", "Tato akce vyžaduje roli správce.");
  }
  return ctx;
}
