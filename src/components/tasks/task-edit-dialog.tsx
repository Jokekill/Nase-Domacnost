"use client";

import { useState } from "react";
import { useDialog } from "@/components/dialog";

export type EditableTask = {
  id: string;
  name: string;
  description: string | null;
  taskListId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  assignees: { userId: string; displayName: string }[];
};

export type TaskPatch = {
  name: string;
  description: string | null;
  taskListId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  assigneeIds: string[];
};

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium";

/**
 * Editing one task: its name, who it is for, when, and the note that goes
 * with it. Bulk assignment (§10.5) stays where it was — this is the form for
 * a single task, reached by tapping it.
 *
 * The ticked people ARE the assignee set, so saving replaces it; emptying the
 * list is a legitimate answer ("nepřiřazeno"), not a no-op.
 */
export function TaskEditDialog({
  task,
  members,
  taskLists,
  onClose,
  onSave,
  onDelete,
  saving,
  error,
}: {
  task: EditableTask;
  members: { userId: string; displayName: string }[];
  taskLists: { id: string; name: string }[];
  onClose: () => void;
  onSave: (patch: TaskPatch) => void;
  onDelete: () => void;
  saving?: boolean;
  error?: string | null;
}) {
  const dialog = useDialog(onClose);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? "");
  const [taskListId, setTaskListId] = useState(task.taskListId ?? "");
  const [periodStart, setPeriodStart] = useState(task.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(task.periodEnd ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assignees.map((a) => a.userId),
  );

  const toggleAssignee = (userId: string) =>
    setAssigneeIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );

  // An end before the start would be stored as-is and then never match the
  // calendar window query — refuse it here instead.
  const datesBackwards =
    periodStart !== "" && periodEnd !== "" && periodEnd < periodStart;

  const save = () =>
    onSave({
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      taskListId: taskListId === "" ? null : taskListId,
      periodStart: periodStart === "" ? null : periodStart,
      periodEnd: periodEnd === "" ? null : periodEnd,
      assigneeIds,
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      {...dialog.backdropProps}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-4 shadow-pop sm:rounded-card"
        {...dialog.panelProps}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={dialog.titleId} className="text-lg font-semibold">
            Upravit úkol
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm min-h-11"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <label>
            <span className={label}>Název</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={input}
            />
          </label>

          <fieldset>
            <legend className={label}>Komu je zadán</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const picked = assigneeIds.includes(member.userId);
                return (
                  <button
                    key={member.userId}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggleAssignee(member.userId)}
                    className={`rounded-full border px-4 py-2 text-sm min-h-11 ${
                      picked
                        ? "border-primary bg-surface-warm text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {picked ? "✓ " : ""}
                    {member.displayName}
                  </button>
                );
              })}
            </div>
            {assigneeIds.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nikdo — úkol zůstane mezi „Ostatní úkoly“.
              </p>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={label}>Na kdy — od</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className={input}
              />
            </label>
            <label>
              <span className={label}>…do</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className={input}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Bez dat je úkol „někdy“ — v kalendáři se pak ukáže v každém týdnu.
          </p>

          {taskLists.length > 0 && (
            <label>
              <span className={label}>Seznam</span>
              <select
                value={taskListId}
                onChange={(e) => setTaskListId(e.target.value)}
                className={input}
              >
                <option value="">— bez seznamu —</option>
                {taskLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span className={label}>Poznámka</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Např. čistič je ve skříňce pod umyvadlem"
              className={`${input} resize-y`}
            />
          </label>
        </div>

        {datesBackwards && (
          <p role="status" className="mt-3 text-sm text-destructive">
            Konec období je dřív než začátek.
          </p>
        )}
        {error && (
          <p role="status" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={name.trim() === "" || datesBackwards || saving}
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
          >
            {saving ? "Ukládám…" : "Uložit"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-5 py-2.5 font-medium min-h-11"
          >
            Zrušit
          </button>
          <button
            onClick={() => {
              if (confirm(`Opravdu smazat úkol „${task.name}“?`)) onDelete();
            }}
            className="ml-auto rounded-lg border border-border px-4 py-2.5 font-medium text-destructive min-h-11"
          >
            Smazat
          </button>
        </div>
      </div>
    </div>
  );
}
