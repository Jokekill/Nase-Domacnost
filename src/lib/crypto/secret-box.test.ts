import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, sameKey, seal } from "./secret-box";

const key = randomBytes(32);
const other = randomBytes(32);

describe("secret-box", () => {
  it("round-trips a password, diacritics included", () => {
    const secret = "Příšerně žluťoučké heslo 123";
    expect(open(seal(secret, key), key)).toBe(secret);
  });

  it("produces a different blob every time", () => {
    // A fresh IV per write: two members with the same password must not have
    // the same row.
    expect(seal("stejne-heslo", key)).not.toBe(seal("stejne-heslo", key));
  });

  it("refuses a blob sealed with another key", () => {
    expect(() => open(seal("tajne", key), other)).toThrow();
  });

  it("refuses a tampered blob instead of returning garbage", () => {
    const [version, iv, tag, ciphertext] = seal("tajne", key).split(".");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;
    const blob = [version, iv, tag, flipped.toString("base64")].join(".");
    expect(() => open(blob, key)).toThrow();
  });

  it("refuses a blob that is not ours", () => {
    expect(() => open("neco-uplne-jineho", key)).toThrow(/Nerozpoznaný formát/);
    expect(() => open("v2.a.b.c", key)).toThrow(/Nerozpoznaný formát/);
  });

  it("handles an empty secret", () => {
    expect(open(seal("", key), key)).toBe("");
  });

  it("compares keys without leaking length mismatches", () => {
    expect(sameKey(key, Buffer.from(key))).toBe(true);
    expect(sameKey(key, other)).toBe(false);
    expect(sameKey(key, randomBytes(16))).toBe(false);
  });
});
