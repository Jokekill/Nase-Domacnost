import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/**
 * Symmetric encryption for the few secrets the app has to be able to read
 * back — today the Rohlík password (D-030).
 *
 * Passwords of OUR users are hashed with argon2 and never decrypted; this is
 * the other case: a credential for somebody else's service, which is useless
 * unless we can hand it over verbatim. Encryption cannot change that, but it
 * keeps the plain text out of `pg_dump` — and the nightly backup is the copy
 * most likely to end up somewhere else (docs/ARCHITECTURE.md §4).
 *
 * AES-256-GCM: authenticated, so a tampered or truncated blob fails loudly
 * instead of decrypting to garbage.
 */

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Encrypts with an explicit key. Exported for tests. */
export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/** Decrypts what `seal` produced. Throws on a wrong key or a changed blob. */
export function open(blob: string, key: Buffer): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Nerozpoznaný formát zašifrované hodnoty.");
  }
  const [, iv, tag, ciphertext] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptSecret(plain: string): string {
  return seal(plain, secretKey());
}

export function decryptSecret(blob: string): string {
  return open(blob, secretKey());
}

/** True when two keys match — used to spot a swapped key file. */
export function sameKey(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Where the key lives                                                */
/* ------------------------------------------------------------------ */

let cached: Buffer | null = null;

/**
 * The key, from `APP_SECRET_KEY` if the installation sets one, otherwise from
 * a file generated on first use.
 *
 * The file deliberately sits OUTSIDE the uploads directory: the backup
 * sidecar tars uploads and dumps the database, so a key kept in either would
 * travel in the same archive as the ciphertext and protect nothing. The price
 * is that restoring a backup onto a fresh machine does not bring the Rohlík
 * password with it — it is typed again in Nastavení, which is the right
 * trade for a stored credential.
 */
export function secretKey(): Buffer {
  if (cached) return cached;

  const fromEnv = process.env.APP_SECRET_KEY;
  if (fromEnv) {
    const key = decodeKey(fromEnv);
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `APP_SECRET_KEY musí mít ${KEY_BYTES} bajtů (base64 nebo hex).`,
      );
    }
    cached = key;
    return key;
  }

  const file = keyFile();
  if (existsSync(file)) {
    const key = decodeKey(readFileSync(file, "utf8").trim());
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `Klíč v ${file} je poškozený — má jinou než očekávanou délku.`,
      );
    }
    cached = key;
    return key;
  }

  const key = randomBytes(KEY_BYTES);
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    // "wx" fails instead of overwriting: two requests arriving together must
    // not each generate a key, with the loser's ciphertext left unreadable.
    writeFileSync(file, key.toString("base64"), { mode: 0o600, flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    cached = decodeKey(readFileSync(file, "utf8").trim());
    return cached;
  }
  try {
    // A umask can widen the mode on creation, so set it explicitly.
    chmodSync(file, 0o600);
  } catch {
    // Windows has no POSIX modes; the dev data directory is git-ignored.
  }
  cached = key;
  return key;
}

/** `/data/secrets` in Docker, `./data/secrets` in development. */
function keyFile(): string {
  const dir =
    process.env.SECRETS_DIR ?? path.join(process.cwd(), "data", "secrets");
  return path.join(dir, "app.key");
}

function decodeKey(value: string): Buffer {
  return /^[0-9a-f]+$/i.test(value) && value.length === KEY_BYTES * 2
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
}

/** Test seam: forget the cached key so a changed env takes effect. */
export function resetKeyCache(): void {
  cached = null;
}
