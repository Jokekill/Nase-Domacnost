import { describe, expect, it } from "vitest";
import {
  decideRecipeAccess,
  isPublicLinkUsable,
  type AccessSubject,
  type RecipeFacts,
} from "./recipe-access";

const OWNER = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";

function recipe(overrides: Partial<RecipeFacts> = {}): RecipeFacts {
  return { ownerId: OWNER, visibility: "household", ...overrides };
}

function subject(overrides: Partial<AccessSubject> = {}): AccessSubject {
  return {
    userId: STRANGER,
    membershipRole: null,
    sharePermission: null,
    hasValidPublicToken: false,
    ...overrides,
  };
}

describe("decideRecipeAccess — vlastník", () => {
  it("smí vše bez ohledu na viditelnost", () => {
    for (const mode of ["view", "edit", "delete"] as const) {
      const out = decideRecipeAccess(
        recipe({ visibility: "private" }),
        subject({ userId: OWNER }),
        mode,
      );
      expect(out).toEqual({ allowed: true, via: "owner" });
    }
  });
});

describe("decideRecipeAccess — domácnost", () => {
  it("člen vidí a edituje recept domácnosti", () => {
    const s = subject({ userId: MEMBER, membershipRole: "member" });
    expect(decideRecipeAccess(recipe(), s, "view").allowed).toBe(true);
    expect(decideRecipeAccess(recipe(), s, "edit").allowed).toBe(true);
  });

  it("mazat cizí recept smí jen správce", () => {
    const member = subject({ userId: MEMBER, membershipRole: "member" });
    const admin = subject({ userId: MEMBER, membershipRole: "admin" });
    expect(decideRecipeAccess(recipe(), member, "delete")).toMatchObject({
      allowed: false,
      reason: "forbidden",
    });
    expect(decideRecipeAccess(recipe(), admin, "delete").allowed).toBe(true);
  });

  it("soukromý recept je pro člena domácnosti neviditelný (not_found, ne forbidden)", () => {
    const out = decideRecipeAccess(
      recipe({ visibility: "private" }),
      subject({ userId: MEMBER, membershipRole: "admin" }),
      "view",
    );
    expect(out).toEqual({
      allowed: false,
      reason: "not_found",
      message: "Recept nenalezen.",
    });
  });
});

describe("decideRecipeAccess — sdílení konkrétnímu uživateli", () => {
  it("view share pustí ke čtení, ne k editaci", () => {
    const s = subject({ sharePermission: "view" });
    expect(decideRecipeAccess(recipe(), s, "view").allowed).toBe(true);
    expect(decideRecipeAccess(recipe(), s, "edit")).toMatchObject({
      allowed: false,
      reason: "forbidden",
    });
  });

  it("edit share pustí i k editaci, ale nikdy k mazání", () => {
    const s = subject({ sharePermission: "edit" });
    expect(decideRecipeAccess(recipe(), s, "edit").allowed).toBe(true);
    expect(decideRecipeAccess(recipe(), s, "delete")).toMatchObject({
      allowed: false,
      reason: "forbidden",
    });
  });

  it("sdílení funguje i u soukromého receptu (rozšiřuje, neomezuje)", () => {
    const out = decideRecipeAccess(
      recipe({ visibility: "private" }),
      subject({ sharePermission: "view" }),
      "view",
    );
    expect(out).toEqual({ allowed: true, via: "share" });
  });

  it("edit share přebije slabší práva člena domácnosti u soukromého receptu", () => {
    const out = decideRecipeAccess(
      recipe({ visibility: "private" }),
      subject({
        userId: MEMBER,
        membershipRole: "member",
        sharePermission: "edit",
      }),
      "edit",
    );
    expect(out).toEqual({ allowed: true, via: "share" });
  });

  it("view share neubere práva členu domácnosti", () => {
    // Recipe is visible to the household anyway — a narrower share must not
    // downgrade the member to read-only.
    const out = decideRecipeAccess(
      recipe(),
      subject({
        userId: MEMBER,
        membershipRole: "member",
        sharePermission: "view",
      }),
      "edit",
    );
    expect(out).toEqual({ allowed: true, via: "household" });
  });
});

describe("decideRecipeAccess — veřejný odkaz", () => {
  it("anonym s platným tokenem smí jen číst", () => {
    const s = subject({ userId: null, hasValidPublicToken: true });
    expect(decideRecipeAccess(recipe(), s, "view")).toEqual({
      allowed: true,
      via: "public_link",
    });
    expect(decideRecipeAccess(recipe(), s, "edit")).toMatchObject({
      allowed: false,
      reason: "forbidden",
    });
    expect(decideRecipeAccess(recipe(), s, "delete")).toMatchObject({
      allowed: false,
      reason: "forbidden",
    });
  });

  it("odkaz otevře i soukromý recept — sdílení je vědomý akt vlastníka", () => {
    const out = decideRecipeAccess(
      recipe({ visibility: "private" }),
      subject({ userId: null, hasValidPublicToken: true }),
      "view",
    );
    expect(out.allowed).toBe(true);
  });

  it("bez tokenu ani bez sdílení cizí člověk nic nedostane", () => {
    expect(decideRecipeAccess(recipe(), subject(), "view")).toMatchObject({
      allowed: false,
      reason: "not_found",
    });
  });
});

describe("isPublicLinkUsable", () => {
  const NOW = new Date("2026-08-14T12:00:00Z");
  const base = { isActive: true, expiresAt: null, deletedAt: null };

  it("aktivní odkaz bez expirace platí", () => {
    expect(isPublicLinkUsable(base, NOW)).toBe(true);
  });

  it("zneaktivněný, smazaný ani prošlý odkaz neplatí", () => {
    expect(isPublicLinkUsable({ ...base, isActive: false }, NOW)).toBe(false);
    expect(isPublicLinkUsable({ ...base, deletedAt: NOW }, NOW)).toBe(false);
    expect(
      isPublicLinkUsable(
        { ...base, expiresAt: new Date("2026-08-14T11:59:59Z") },
        NOW,
      ),
    ).toBe(false);
  });

  it("odkaz s expirací v budoucnu platí", () => {
    expect(
      isPublicLinkUsable(
        { ...base, expiresAt: new Date("2026-08-15T00:00:00Z") },
        NOW,
      ),
    ).toBe(true);
  });
});
