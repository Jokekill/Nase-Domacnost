import { createHash, randomBytes } from "node:crypto";

/** Random 32-byte token, base64url — sent to the client, never stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the SHA-256 of a token is stored in the DB (docs/ARCHITECTURE.md §1.2). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
