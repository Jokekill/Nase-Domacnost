import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { generateToken, hashToken } from "./tokens";

const SESSION_DAYS = 90;
const SLIDING_RENEW_AFTER_DAYS = SESSION_DAYS / 2;

const useInsecureCookies = process.env.DEV_INSECURE_COOKIES === "true";
export const SESSION_COOKIE = useInsecureCookies
  ? "session"
  : "__Host-session";

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: !useInsecureCookies,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

export type SessionUser = typeof users.$inferSelect;

/**
 * Validates the session cookie. Returns the user or null.
 * Slides expiration when the session is past half of its window.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())),
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.user.deletedAt) return null;

  const ageMs = Date.now() - row.session.createdAt.getTime();
  const renewThresholdMs = SLIDING_RENEW_AFTER_DAYS * 86400_000;
  if (ageMs > renewThresholdMs) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    await db
      .update(sessions)
      .set({ expiresAt, createdAt: new Date(), lastUsedAt: new Date() })
      .where(eq(sessions.id, row.session.id));
    // Refresh the cookie expiry too (server components cannot always set
    // cookies; ignore failures — the DB expiry is what matters).
    try {
      store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
    } catch {
      /* read-only context */
    }
  }

  return row.user;
}
