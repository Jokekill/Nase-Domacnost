import { describe, expect, it } from "vitest";
import {
  describeSuggestion,
  formatInterval,
  suggestOccasionalTasks,
  type SuggestionTemplate,
} from "./task-suggestions";

const TODAY = new Date("2026-08-14T10:00:00");
const daysAgo = (n: number) =>
  new Date(TODAY.getTime() - n * 86_400_000);

function template(
  overrides: Partial<SuggestionTemplate> & Pick<SuggestionTemplate, "templateId">,
): SuggestionTemplate {
  return {
    name: overrides.templateId,
    intervalDays: 30,
    lastCompletedAt: null,
    createdAt: daysAgo(400),
    hasOpenTask: false,
    ...overrides,
  };
}

describe("suggestOccasionalTasks — what is due", () => {
  it("suggests a template past its interval", () => {
    // Oven: cleaned 1 July, interval 2 months → due (zadání example)
    const out = suggestOccasionalTasks(
      [
        template({
          templateId: "trouba",
          name: "Vyčistit troubu",
          intervalDays: 60,
          lastCompletedAt: daysAgo(75),
        }),
      ],
      TODAY,
    );
    expect(out).toHaveLength(1);
    expect(out[0].daysOverdue).toBe(15);
  });

  it("does not suggest a template that is not due yet", () => {
    const out = suggestOccasionalTasks(
      [
        template({
          templateId: "trouba",
          intervalDays: 60,
          lastCompletedAt: daysAgo(30),
        }),
      ],
      TODAY,
    );
    expect(out).toEqual([]);
  });

  it("treats a never-completed template as due once the interval passed", () => {
    const out = suggestOccasionalTasks(
      [
        template({
          templateId: "okna",
          intervalDays: 90,
          lastCompletedAt: null,
          createdAt: daysAgo(100),
        }),
      ],
      TODAY,
    );
    expect(out).toHaveLength(1);
    expect(out[0].lastCompletedAt).toBeNull();
  });

  it("ignores templates without an interval", () => {
    const out = suggestOccasionalTasks(
      [template({ templateId: "jednorazovy", intervalDays: null })],
      TODAY,
    );
    expect(out).toEqual([]);
  });

  it("skips templates that already have an open task", () => {
    const out = suggestOccasionalTasks(
      [
        template({
          templateId: "trouba",
          intervalDays: 60,
          lastCompletedAt: daysAgo(90),
          hasOpenTask: true,
        }),
      ],
      TODAY,
    );
    expect(out).toEqual([]);
  });
});

describe("suggestOccasionalTasks — load spreading", () => {
  it("returns at most the requested number of suggestions", () => {
    const templates = Array.from({ length: 8 }, (_, i) =>
      template({
        templateId: `t${i}`,
        intervalDays: 30,
        lastCompletedAt: daysAgo(40 + i),
      }),
    );
    expect(suggestOccasionalTasks(templates, TODAY)).toHaveLength(3);
    expect(suggestOccasionalTasks(templates, TODAY, 5)).toHaveLength(5);
  });

  it("returns everything when the cap is disabled", () => {
    const templates = Array.from({ length: 6 }, (_, i) =>
      template({
        templateId: `t${i}`,
        intervalDays: 30,
        lastCompletedAt: daysAgo(45),
      }),
    );
    expect(suggestOccasionalTasks(templates, TODAY, 0)).toHaveLength(6);
  });

  it("orders by relative lateness, not absolute days", () => {
    const out = suggestOccasionalTasks(
      [
        // 10 days late on a yearly job = barely late
        template({
          templateId: "rocni",
          intervalDays: 365,
          lastCompletedAt: daysAgo(375),
        }),
        // 10 days late on a weekly job = very late
        template({
          templateId: "tydenni",
          intervalDays: 7,
          lastCompletedAt: daysAgo(17),
        }),
      ],
      TODAY,
    );
    expect(out.map((s) => s.templateId)).toEqual(["tydenni", "rocni"]);
  });

  it("prefers the rarer job when lateness is equal", () => {
    const out = suggestOccasionalTasks(
      [
        template({
          templateId: "castejsi",
          intervalDays: 30,
          lastCompletedAt: daysAgo(60), // 100 % overdue
        }),
        template({
          templateId: "vzacnejsi",
          intervalDays: 180,
          lastCompletedAt: daysAgo(360), // also 100 % overdue
        }),
      ],
      TODAY,
    );
    expect(out.map((s) => s.templateId)).toEqual(["vzacnejsi", "castejsi"]);
  });
});

describe("formatting", () => {
  it("names common intervals in Czech", () => {
    expect(formatInterval(1)).toBe("denně");
    expect(formatInterval(7)).toBe("týdně");
    expect(formatInterval(14)).toBe("2 týdny");
    expect(formatInterval(30)).toBe("měsíčně");
    expect(formatInterval(365)).toBe("ročně");
    expect(formatInterval(60)).toBe("2 měsíce");
    expect(formatInterval(21)).toBe("3 týdny");
    expect(formatInterval(70)).toBe("10 týdnů");
    expect(formatInterval(5)).toBe("5 dní");
  });

  it("describes when the task was last done", () => {
    // Cleaned 1 June, interval 2 months → overdue on 14 August.
    const [suggestion] = suggestOccasionalTasks(
      [
        template({
          templateId: "trouba",
          intervalDays: 60,
          lastCompletedAt: new Date("2026-06-01T09:00:00"),
        }),
      ],
      TODAY,
    );
    expect(describeSuggestion(suggestion)).toContain("naposledy 1. 6. 2026");
    expect(describeSuggestion(suggestion)).toContain("interval 2 měsíce");
  });

  it("says so when the task was never done", () => {
    const [suggestion] = suggestOccasionalTasks(
      [
        template({
          templateId: "okna",
          intervalDays: 90,
          lastCompletedAt: null,
          createdAt: daysAgo(120),
        }),
      ],
      TODAY,
    );
    expect(describeSuggestion(suggestion)).toBe(
      "zatím nikdy · interval 3 měsíce",
    );
  });
});
