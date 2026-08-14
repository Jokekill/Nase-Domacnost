import { describe, expect, it } from "vitest";
import {
  effectiveTimestamp,
  mergeRow,
  type FieldMtimes,
  type MergeInput,
} from "./sync-merge";

const T = (iso: string) => new Date(iso);
const EARLY = "2026-08-14T10:00:00.000Z";
const LATE = "2026-08-14T12:00:00.000Z";

function input(overrides: Partial<MergeInput> = {}): MergeInput {
  return {
    current: { title: "Bábovka", notes: null, deletedAt: null },
    fieldMtimes: {} as FieldMtimes,
    payload: {},
    effectiveTs: T(LATE),
    entity: "recipes",
    ...overrides,
  };
}

describe("effectiveTimestamp — clamp hodin klienta", () => {
  it("hodiny v budoucnosti se ořežou na čas přijetí", () => {
    const out = effectiveTimestamp(T("2027-01-01T00:00:00Z"), T(LATE));
    expect(out.toISOString()).toBe(LATE);
  });

  it("hodiny v minulosti se ponechají", () => {
    const out = effectiveTimestamp(T(EARLY), T(LATE));
    expect(out.toISOString()).toBe(EARLY);
  });
});

describe("mergeRow — různá pole se nikdy nebijí", () => {
  it("Eliška mění název, Vojta postup — obojí projde", () => {
    const out = mergeRow(
      input({
        fieldMtimes: { notes: LATE },
        payload: { title: "Babiččina bábovka" },
        effectiveTs: T("2026-08-14T12:30:00.000Z"),
      }),
    );
    expect(out).toMatchObject({ status: "applied", discardedFields: [] });
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates).toEqual({ title: "Babiččina bábovka" });
    expect(out.fieldMtimes.notes).toBe(LATE);
  });
});

describe("mergeRow — stejné pole, LWW", () => {
  it("novější zápis vyhraje", () => {
    const out = mergeRow(
      input({ fieldMtimes: { title: EARLY }, payload: { title: "Nový" } }),
    );
    expect(out.status).toBe("applied");
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates.title).toBe("Nový");
    expect(out.fieldMtimes.title).toBe(LATE);
  });

  it("starší zápis se zahodí a ohlásí", () => {
    const out = mergeRow(
      input({
        fieldMtimes: { title: LATE },
        payload: { title: "Starý" },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out).toMatchObject({
      status: "merged_partial",
      discardedFields: ["title"],
    });
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates).toEqual({});
    expect(out.fieldMtimes.title).toBe(LATE);
  });

  it("část dávky projde, část se zahodí", () => {
    const out = mergeRow(
      input({
        fieldMtimes: { title: LATE },
        payload: { title: "Starý", notes: "Nová poznámka" },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out.status).toBe("merged_partial");
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates).toEqual({ notes: "Nová poznámka" });
    expect(out.discardedFields).toEqual(["title"]);
  });

  it("stejná hodnota z obou stran není konflikt", () => {
    const out = mergeRow(
      input({
        current: { title: "Bábovka", deletedAt: null },
        fieldMtimes: { title: LATE },
        payload: { title: "Bábovka" },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out).toMatchObject({ status: "applied", discardedFields: [] });
  });
});

describe("mergeRow — odškrtnutí vyhrává (§4.2)", () => {
  it("starší odškrtnutí přebije souběžné neodškrtnuto", () => {
    const out = mergeRow(
      input({
        entity: "shopping_items",
        current: { isChecked: false, deletedAt: null },
        fieldMtimes: { isChecked: LATE },
        payload: { isChecked: true },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out.status).toBe("applied");
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates.isChecked).toBe(true);
    // Tie-break, ne novější zápis — mtime zůstává, aby pozdější odškrtnutí
    // zpátky pořád mohlo vyhrát.
    expect(out.fieldMtimes.isChecked).toBe(LATE);
  });

  it("starší ODškrtnutí (true→false) nepřebije novější zaškrtnutí", () => {
    const out = mergeRow(
      input({
        entity: "shopping_items",
        current: { isChecked: true, deletedAt: null },
        fieldMtimes: { isChecked: LATE },
        payload: { isChecked: false },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out).toMatchObject({
      status: "merged_partial",
      discardedFields: ["isChecked"],
    });
  });

  it("novější odškrtnutí zpět na false projde normálně", () => {
    const out = mergeRow(
      input({
        entity: "shopping_items",
        current: { isChecked: true, deletedAt: null },
        fieldMtimes: { isChecked: EARLY },
        payload: { isChecked: false },
        effectiveTs: T(LATE),
      }),
    );
    expect(out.status).toBe("applied");
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates.isChecked).toBe(false);
  });

  it("u úkolů vyhrává přechod do 'done'", () => {
    const out = mergeRow(
      input({
        entity: "tasks",
        current: { status: "open", deletedAt: null },
        fieldMtimes: { status: LATE },
        payload: { status: "done" },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out.status).toBe("applied");
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates.status).toBe("done");
  });

  it("pravidlo platí jen pro dané tabulky", () => {
    const out = mergeRow(
      input({
        entity: "recipes",
        current: { isChecked: false, deletedAt: null },
        fieldMtimes: { isChecked: LATE },
        payload: { isChecked: true },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out.status).toBe("merged_partial");
  });
});

describe("mergeRow — mazání (§4.3)", () => {
  it("update na smazaný řádek se odmítne", () => {
    const out = mergeRow(
      input({
        current: { title: "Bábovka", deletedAt: new Date(EARLY) },
        payload: { title: "Nový" },
      }),
    );
    expect(out).toEqual({
      status: "rejected",
      reason: "row_deleted",
      discardedFields: ["title"],
    });
  });

  it("delete vyhrává i proti novějším mtime", () => {
    const out = mergeRow(
      input({
        fieldMtimes: { deletedAt: LATE, title: LATE },
        payload: { deletedAt: new Date(EARLY) },
        effectiveTs: T(EARLY),
      }),
    );
    expect(out.status).toBe("applied");
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.updates.deletedAt).toEqual(new Date(EARLY));
  });

  it("smazaný řádek jde znovu smazat (idempotentní doručení)", () => {
    const out = mergeRow(
      input({
        current: { title: "Bábovka", deletedAt: new Date(EARLY) },
        payload: { deletedAt: new Date(LATE) },
      }),
    );
    expect(out.status).toBe("applied");
  });
});

describe("mergeRow — první zápis do pole", () => {
  it("pole bez historie přijme cokoli", () => {
    const out = mergeRow(
      input({ payload: { notes: "První poznámka" }, effectiveTs: T(EARLY) }),
    );
    expect(out.status).toBe("applied");
    if (out.status === "rejected") throw new Error("nemá být rejected");
    expect(out.fieldMtimes.notes).toBe(EARLY);
  });
});
