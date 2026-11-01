import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import { integrationCredentials } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { RohlikSession } from "./client";

const PROVIDER = "rohlik";

type Actor = { userId: string; householdId: string };

export type RohlikCredentials = { login: string; password: string };

export type RohlikStatus = {
  /** Where the credentials come from, or that there are none. */
  source: "settings" | "env" | "none";
  /** The e-mail, so Nastavení can say who is connected. Never the password. */
  login: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  /** True when this installation can fill a basket at all. */
  configured: boolean;
};

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

/**
 * The credentials to sign in with (D-030).
 *
 * What Nastavení saved wins; the `ROHLIK_EMAIL` / `ROHLIK_PASSWORD`
 * environment variables stay as a fallback so an installation that already
 * set them keeps working without touching anything.
 */
export async function getRohlikCredentials(
  householdId: string,
): Promise<RohlikCredentials | null> {
  const row = await findRow(householdId);
  if (row) {
    try {
      return {
        login: row.login,
        password: decryptSecret(row.secretCiphertext),
      };
    } catch {
      // A key that no longer matches the ciphertext (restored backup, swapped
      // APP_SECRET_KEY). Saying so is the only useful thing we can do —
      // silently falling back to the env would be worse than confusing.
      throw new ApiError(
        "validation_error",
        "Uložené přihlášení k Rohlíku nejde rozšifrovat — nejspíš se změnil klíč instalace. Zadej e-mail a heslo v Nastavení znovu.",
      );
    }
  }
  const email = process.env.ROHLIK_EMAIL;
  const password = process.env.ROHLIK_PASSWORD;
  return email && password ? { login: email, password } : null;
}

export async function getRohlikStatus(
  householdId: string,
): Promise<RohlikStatus> {
  const row = await findRow(householdId);
  if (row) {
    return {
      source: "settings",
      login: row.login,
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      lastError: row.lastError,
      configured: true,
    };
  }
  if (process.env.ROHLIK_EMAIL && process.env.ROHLIK_PASSWORD) {
    return {
      source: "env",
      login: process.env.ROHLIK_EMAIL,
      lastVerifiedAt: null,
      lastError: null,
      configured: true,
    };
  }
  return {
    source: "none",
    login: null,
    lastVerifiedAt: null,
    lastError: null,
    configured: false,
  };
}

/** Cheap check for `/api/auth/me` — does the basket button do anything? */
export async function rohlikConfigured(householdId: string): Promise<boolean> {
  if (await findRow(householdId)) return true;
  return Boolean(process.env.ROHLIK_EMAIL && process.env.ROHLIK_PASSWORD);
}

async function findRow(householdId: string) {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.householdId, householdId),
        eq(integrationCredentials.provider, PROVIDER),
      ),
    )
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Writing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Signs in with what the admin typed and stores it only if Rohlík accepted
 * it (D-030).
 *
 * Verifying first is the whole point of doing this in a form: a password that
 * is quietly saved and then fails at the checkout, days later, in front of a
 * full shopping list, is worse than no integration. A rejected password is
 * never written, so a typo cannot replace a working one.
 */
export async function saveRohlikCredentials(
  actor: Actor,
  input: RohlikCredentials,
): Promise<RohlikStatus> {
  await signIn(input);

  const now = new Date();
  await db
    .insert(integrationCredentials)
    .values({
      id: uuidv7(),
      householdId: actor.householdId,
      provider: PROVIDER,
      login: input.login,
      secretCiphertext: encryptSecret(input.password),
      lastVerifiedAt: now,
      lastError: null,
      lastModifiedBy: actor.userId,
    })
    .onConflictDoUpdate({
      target: [
        integrationCredentials.householdId,
        integrationCredentials.provider,
      ],
      set: {
        login: input.login,
        secretCiphertext: encryptSecret(input.password),
        lastVerifiedAt: now,
        lastError: null,
        lastModifiedBy: actor.userId,
        updatedAt: now,
      },
    });

  return getRohlikStatus(actor.householdId);
}

/** Signs in with what is stored, to confirm it still works. */
export async function verifyRohlikCredentials(
  actor: Actor,
): Promise<RohlikStatus> {
  const credentials = await getRohlikCredentials(actor.householdId);
  if (!credentials) {
    throw new ApiError("not_found", "Rohlík zatím není připojený.");
  }
  try {
    await signIn(credentials);
    await recordOutcome(actor.householdId, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Přihlášení selhalo.";
    // Remembered, not thrown away: Nastavení then says why it stopped working
    // even when nobody is watching the screen at the time.
    await recordOutcome(actor.householdId, message);
    throw err;
  }
  return getRohlikStatus(actor.householdId);
}

/** Disconnects: the row is deleted, not flagged. */
export async function deleteRohlikCredentials(actor: Actor): Promise<void> {
  await db
    .delete(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.householdId, actor.householdId),
        eq(integrationCredentials.provider, PROVIDER),
      ),
    );
}

/** Notes how the last sign-in went, without touching the stored password. */
export async function recordOutcome(
  householdId: string,
  error: string | null,
): Promise<void> {
  await db
    .update(integrationCredentials)
    .set({
      lastError: error,
      ...(error === null ? { lastVerifiedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(integrationCredentials.householdId, householdId),
        eq(integrationCredentials.provider, PROVIDER),
      ),
    );
}

async function signIn(credentials: RohlikCredentials): Promise<void> {
  await RohlikSession.login(credentials);
}
