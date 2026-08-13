import { describe, expect, it } from "vitest";
import {
  dateKey,
  expandOccurrences,
  formatRrule,
  parseRrule,
} from "./recurrence";

const at = (iso: string) => new Date(iso);
const keys = (dates: Date[]) => dates.map(dateKey);

describe("parseRrule", () => {
  it("parses the supported subset", () => {
    expect(parseRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toEqual({
      freq: "WEEKLY",
      interval: 2,
      byDay: ["MO", "WE"],
      until: undefined,
      count: undefined,
    });
  });
  it("accepts the RRULE: prefix and compact UNTIL", () => {
    const rule = parseRrule("RRULE:FREQ=DAILY;UNTIL=20260820T235959Z");
    expect(rule?.freq).toBe("DAILY");
    expect(rule?.until?.toISOString()).toBe("2026-08-20T23:59:59.000Z");
  });
  it("returns null for empty or unsupported rules", () => {
    expect(parseRrule(null)).toBeNull();
    expect(parseRrule("")).toBeNull();
    expect(parseRrule("FREQ=HOURLY")).toBeNull();
  });
  it("round-trips through formatRrule", () => {
    const text = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5";
    expect(formatRrule(parseRrule(text)!)).toBe(text);
  });
});

describe("expandOccurrences — one-off events", () => {
  it("returns the event when it falls inside the range", () => {
    const start = at("2026-08-13T18:00:00");
    expect(
      expandOccurrences(start, null, at("2026-08-10"), at("2026-08-20")),
    ).toEqual([start]);
  });
  it("returns nothing outside the range", () => {
    expect(
      expandOccurrences(
        at("2026-09-01T18:00:00"),
        null,
        at("2026-08-10"),
        at("2026-08-20"),
      ),
    ).toEqual([]);
  });
});

describe("expandOccurrences — daily and weekly", () => {
  it("expands a daily rule", () => {
    const out = expandOccurrences(
      at("2026-08-13T08:00:00"),
      "FREQ=DAILY",
      at("2026-08-13T00:00:00"),
      at("2026-08-16T23:59:59"),
    );
    expect(keys(out)).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });
  it("honours INTERVAL", () => {
    const out = expandOccurrences(
      at("2026-08-13T08:00:00"),
      "FREQ=DAILY;INTERVAL=3",
      at("2026-08-13T00:00:00"),
      at("2026-08-23T23:59:59"),
    );
    expect(keys(out)).toEqual(["2026-08-13", "2026-08-16", "2026-08-19", "2026-08-22"]);
  });
  it("expands BYDAY weekly rules", () => {
    // 2026-08-13 is a Thursday; Mondays and Wednesdays from then on.
    const out = expandOccurrences(
      at("2026-08-13T16:00:00"),
      "FREQ=WEEKLY;BYDAY=MO,WE",
      at("2026-08-13T00:00:00"),
      at("2026-08-27T23:59:59"),
    );
    expect(keys(out)).toEqual([
      "2026-08-17",
      "2026-08-19",
      "2026-08-24",
      "2026-08-26",
    ]);
  });
  it("keeps the original time of day", () => {
    const out = expandOccurrences(
      at("2026-08-13T16:30:00"),
      "FREQ=WEEKLY",
      at("2026-08-13T00:00:00"),
      at("2026-08-28T23:59:59"),
    );
    expect(out.every((d) => d.getHours() === 16 && d.getMinutes() === 30)).toBe(
      true,
    );
  });
});

describe("expandOccurrences — monthly and yearly", () => {
  it("expands monthly rules", () => {
    const out = expandOccurrences(
      at("2026-01-15T09:00:00"),
      "FREQ=MONTHLY",
      at("2026-01-01"),
      at("2026-04-30T23:59:59"),
    );
    expect(keys(out)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });
  it("clamps day 31 to shorter months", () => {
    const out = expandOccurrences(
      at("2026-01-31T09:00:00"),
      "FREQ=MONTHLY",
      at("2026-01-01"),
      at("2026-03-31T23:59:59"),
    );
    expect(keys(out)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("expands yearly rules", () => {
    const out = expandOccurrences(
      at("2026-08-13T09:00:00"),
      "FREQ=YEARLY",
      at("2026-01-01"),
      at("2029-12-31T23:59:59"),
    );
    expect(keys(out)).toEqual(["2026-08-13", "2027-08-13", "2028-08-13", "2029-08-13"]);
  });
});

describe("expandOccurrences — limits", () => {
  it("stops at UNTIL", () => {
    const out = expandOccurrences(
      at("2026-08-13T08:00:00"),
      "FREQ=DAILY;UNTIL=20260815T235959Z",
      at("2026-08-13T00:00:00"),
      at("2026-08-31T23:59:59"),
    );
    expect(keys(out)).toEqual(["2026-08-13", "2026-08-14", "2026-08-15"]);
  });
  it("stops after COUNT occurrences even across ranges", () => {
    const out = expandOccurrences(
      at("2026-08-13T08:00:00"),
      "FREQ=DAILY;COUNT=3",
      at("2026-08-13T00:00:00"),
      at("2026-08-31T23:59:59"),
    );
    expect(keys(out)).toEqual(["2026-08-13", "2026-08-14", "2026-08-15"]);
  });
  it("counts occurrences before the range towards COUNT", () => {
    // 5 daily occurrences from 13 Aug; asking only for 16–20 Aug yields 17 Aug.
    const out = expandOccurrences(
      at("2026-08-13T08:00:00"),
      "FREQ=DAILY;COUNT=5",
      at("2026-08-16T00:00:00"),
      at("2026-08-20T23:59:59"),
    );
    expect(keys(out)).toEqual(["2026-08-16", "2026-08-17"]);
  });
});
