/**
 * Field-level last-write-wins merge (docs/SYNC.md §4, D-008).
 *
 * Pure on purpose: every conflict rule the app has lives here and is tested
 * without a database. The server helper in src/lib/sync/service.ts only feeds
 * it the current row and applies whatever comes back.
 */

export type FieldMtimes = Record<string, string>;

export type MergeInput = {
  /** Row as it is in the database right now. */
  current: Record<string, unknown>;
  /** field → ISO timestamp of the last accepted write. */
  fieldMtimes: FieldMtimes;
  /** Only the fields the client actually changed. */
  payload: Record<string, unknown>;
  /** Client clock, already clamped — see effectiveTimestamp(). */
  effectiveTs: Date;
  /** Table name, for the special rules below. */
  entity: string;
};

export type MergeResult =
  | {
      status: "applied" | "merged_partial";
      updates: Record<string, unknown>;
      fieldMtimes: FieldMtimes;
      discardedFields: string[];
    }
  | { status: "rejected"; reason: "row_deleted"; discardedFields: string[] };

/**
 * A client clock ahead of the server must not win forever, and a client clock
 * behind must not lose more than it has to: effective = min(client, now).
 */
export function effectiveTimestamp(clientTs: Date, receivedAt: Date): Date {
  return clientTs.getTime() < receivedAt.getTime() ? clientTs : receivedAt;
}

/**
 * Fields where reaching the "done" state wins over a concurrent "not done",
 * regardless of timestamps (docs/SYNC.md §4.2): buying something twice is
 * worse than buying it once too few.
 */
const CHECKED_WINS: Record<string, { field: string; winning: unknown }> = {
  shopping_items: { field: "isChecked", winning: true },
  tasks: { field: "status", winning: "done" },
};

export function mergeRow(input: MergeInput): MergeResult {
  const { current, payload, effectiveTs, entity } = input;

  // Delete always wins over a concurrent update (docs/SYNC.md §4.3).
  if (current.deletedAt != null && payload.deletedAt == null) {
    return {
      status: "rejected",
      reason: "row_deleted",
      discardedFields: Object.keys(payload),
    };
  }

  const fieldMtimes: FieldMtimes = { ...input.fieldMtimes };
  const updates: Record<string, unknown> = {};
  const discardedFields: string[] = [];
  const rule = CHECKED_WINS[entity];

  for (const [field, value] of Object.entries(payload)) {
    // Soft delete is not a normal field: it wins whenever it arrives.
    if (field === "deletedAt" && value != null) {
      updates[field] = value;
      fieldMtimes[field] = effectiveTs.toISOString();
      continue;
    }

    const lastWrite = fieldMtimes[field];
    const isNewer = !lastWrite || effectiveTs.getTime() > Date.parse(lastWrite);

    if (isNewer) {
      updates[field] = value;
      fieldMtimes[field] = effectiveTs.toISOString();
      continue;
    }

    // Older write, but "done wins": accept it anyway when it moves the row
    // INTO the winning state and the row is not there yet.
    if (
      rule &&
      field === rule.field &&
      value === rule.winning &&
      current[field] !== rule.winning
    ) {
      updates[field] = value;
      // Deliberately not touching the mtime: this write did not happen later,
      // it just won a tie-break. A genuinely newer uncheck must still win.
      continue;
    }

    // Same value on both sides is not a conflict worth reporting.
    if (current[field] === value) continue;

    discardedFields.push(field);
  }

  return {
    status: discardedFields.length ? "merged_partial" : "applied",
    updates,
    fieldMtimes,
    discardedFields,
  };
}

/**
 * Human-readable note for the toast (docs/SYNC.md §4.4). Nothing is ever
 * discarded silently.
 */
export function describeDiscarded(
  entity: string,
  discardedFields: string[],
): string {
  const labels: Record<string, string> = {
    title: "název",
    notes: "poznámky",
    intro: "úvod",
    amount: "množství",
    unit: "jednotka",
    isChecked: "odškrtnutí",
    status: "stav",
    name: "název",
    note: "poznámka",
  };
  const named = discardedFields.map((f) => labels[f] ?? f).join(", ");
  return `Tvoje změna (${named}) v ${entity} se neuložila — někdo ji mezitím změnil novější úpravou.`;
}
