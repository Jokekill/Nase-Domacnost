"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CleanupWizard } from "@/components/tasks/cleanup-wizard";
import { EmptyState } from "@/components/empty-state";
import { OfflineNotice } from "@/components/offline-notice";
import { apiFetch } from "@/lib/api/client";
import { formatRange } from "@/lib/dates";
import { completeTask } from "@/lib/offline/mutations";
import { cached, readTasksFromMirror } from "@/lib/offline/reads";
import {
  describeSuggestion,
  type TaskSuggestion,
} from "@/lib/domain/task-suggestions";

type Assignee = { userId: string; displayName: string };
type Task = {
  id: string;
  taskListId: string | null;
  taskListName: string | null;
  templateId: string | null;
  name: string;
  description: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: "open" | "done";
  completedByName: string | null;
  assignees: Assignee[];
};
type Me = { id: string; displayName: string };
type Member = { userId: string; displayName: string };
type RawSuggestion = Omit<TaskSuggestion, "lastCompletedAt"> & {
  lastCompletedAt: string | null;
};

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [showWizard, setShowWizard] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [assignUser, setAssignUser] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => cached("me", () => apiFetch<Me>("/api/auth/me")),
  });
  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: () =>
      cached("members", () =>
        apiFetch<{ items: Member[] }>("/api/household/members"),
      ),
  });
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks"],
    // Offline the list comes from the mirror (docs/SYNC.md §6, priority 3).
    queryFn: async () => {
      try {
        return await apiFetch<{ items: Task[] }>("/api/tasks");
      } catch (err) {
        const mirrored = await readTasksFromMirror().catch(() => null);
        if (mirrored) {
          return { ...mirrored, offline: true } as unknown as {
            items: Task[];
            offline: true;
          };
        }
        throw err;
      }
    },
  });
  const { data: suggestions } = useQuery({
    queryKey: ["task-suggestions"],
    queryFn: () =>
      apiFetch<{ items: RawSuggestion[] }>("/api/tasks/suggestions"),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["task-suggestions"] });
    await queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  const complete = useMutation({
    // Through the outbox, online or not — same reasoning as ticking off the
    // shopping list (D-025): the queue is idempotent and survives a dropout.
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      completeTask(id, done),
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previous = queryClient.getQueryData<{ items: Task[] }>(["tasks"]);
      queryClient.setQueryData<{ items: Task[] }>(["tasks"], (old) =>
        old
          ? {
              items: old.items.map((t) =>
                t.id === id ? { ...t, status: done ? "done" : "open" } : t,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous)
        queryClient.setQueryData(["tasks"], context.previous);
    },
    onSettled: invalidate,
  });

  const assign = useMutation({
    mutationFn: () =>
      apiFetch("/api/tasks/assign", {
        method: "POST",
        json: { taskIds: picked, userId: assignUser, mode: "add" },
      }),
    onSuccess: async () => {
      const name =
        members?.items.find((m) => m.userId === assignUser)?.displayName ?? "";
      setMessage(`Přiřazeno ${picked.length} úkolů — ${name}.`);
      setPicked([]);
      await invalidate();
    },
  });

  const addFromSuggestion = useMutation({
    mutationFn: (suggestion: RawSuggestion) =>
      apiFetch("/api/tasks", {
        method: "POST",
        json: { templateIds: [suggestion.templateId] },
      }),
    onSuccess: invalidate,
  });

  const items = tasks?.items ?? [];
  const offline =
    (tasks as { offline?: boolean } | undefined)?.offline === true;
  const open = items.filter((t) => t.status === "open");
  const done = items.filter((t) => t.status === "done");
  const mine = open.filter((t) => t.assignees.some((a) => a.userId === me?.id));
  const others = open.filter(
    (t) => !t.assignees.some((a) => a.userId === me?.id),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">Úkoly</h1>
        <div className="flex gap-2">
          {/* Assigning and creating tasks are online-only (D-025) — offline we
              hide them instead of letting them fail. */}
          {!offline && (
            <>
              <button
                onClick={() => {
                  setAssignMode(!assignMode);
                  setPicked([]);
                }}
                className={`rounded-lg border px-4 py-2 text-sm font-medium min-h-11 ${
                  assignMode ? "border-primary text-primary" : "border-border"
                }`}
              >
                👥 Přiřadit
              </button>
              <button
                onClick={() => setShowWizard(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
              >
                + Nový úklid
              </button>
            </>
          )}
        </div>
      </div>

      {offline && (
        <OfflineNotice>
          Odškrtávání se uloží do fronty a odešle se po připojení. Nové úklidy a
          přiřazování počkají na síť.
        </OfflineNotice>
      )}

      {message && (
        <p className="mb-3 rounded-lg bg-surface-warm p-2.5 text-sm">
          {message}
        </p>
      )}

      {assignMode && (
        <div className="mb-4 rounded-card border border-primary bg-surface p-4">
          <p className="mb-2 text-sm font-medium">
            1. Vyber osobu · 2. zaškrtni její úkoly · 3. potvrď
          </p>
          <div className="flex flex-wrap gap-2">
            {(members?.items ?? []).map((member) => (
              <button
                key={member.userId}
                onClick={() => setAssignUser(member.userId)}
                className={`rounded-full border px-4 py-2 text-sm min-h-11 ${
                  assignUser === member.userId
                    ? "border-primary bg-surface-warm text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {member.displayName}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => assign.mutate()}
              disabled={!assignUser || picked.length === 0 || assign.isPending}
              className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
            >
              Přiřadit vybrané ({picked.length})
            </button>
            <button
              onClick={() => {
                setAssignMode(false);
                setPicked([]);
              }}
              className="rounded-lg border border-border px-4 py-2 min-h-11"
            >
              Hotovo
            </button>
          </div>
        </div>
      )}

      {!offline && (suggestions?.items ?? []).length > 0 && (
        <section className="mb-4 rounded-card border border-border bg-surface-warm p-4">
          <h2 className="mb-2 font-semibold">🔁 Je čas znovu</h2>
          <ul className="space-y-2">
            {(suggestions?.items ?? []).map((suggestion) => (
              <li
                key={suggestion.templateId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  <strong>{suggestion.name}</strong>{" "}
                  <span className="text-muted-foreground">
                    (
                    {describeSuggestion({
                      ...suggestion,
                      lastCompletedAt: suggestion.lastCompletedAt
                        ? new Date(suggestion.lastCompletedAt)
                        : null,
                    })}
                    )
                  </span>
                </span>
                <button
                  onClick={() => addFromSuggestion.mutate(suggestion)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground min-h-11"
                >
                  Zařadit
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Nabízíme nejvýš 3 najednou, aby se práce rozložila do víc týdnů.
          </p>
        </section>
      )}

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Načítám…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Zatím žádné úkoly"
          description="Založ úklid tlačítkem „Nový úklid“ — vybereš období a úkoly ze šablon."
        />
      ) : (
        <>
          <TaskGroup
            title="Moje úkoly"
            tasks={mine}
            emptyText="Nic ti není přiřazeno."
            assignMode={assignMode}
            picked={picked}
            onPick={setPicked}
            onToggle={(id, done) => complete.mutate({ id, done })}
          />
          <TaskGroup
            title="Ostatní úkoly"
            tasks={others}
            muted
            emptyText="Všechno je rozdělené."
            assignMode={assignMode}
            picked={picked}
            onPick={setPicked}
            onToggle={(id, done) => complete.mutate({ id, done })}
          />
          {done.length > 0 && (
            <TaskGroup
              title={`Hotovo (${done.length})`}
              tasks={done}
              muted
              assignMode={false}
              picked={picked}
              onPick={setPicked}
              onToggle={(id, isDone) => complete.mutate({ id, done: isDone })}
            />
          )}
        </>
      )}

      {showWizard && (
        <CleanupWizard
          onClose={() => setShowWizard(false)}
          onCreated={async (created) => {
            setShowWizard(false);
            setMessage(
              `Vytvořeno ${created.length} úkolů. Teď je můžeš přiřadit tlačítkem „Přiřadit“.`,
            );
            await invalidate();
          }}
        />
      )}
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  emptyText,
  muted,
  assignMode,
  picked,
  onPick,
  onToggle,
}: {
  title: string;
  tasks: Task[];
  emptyText?: string;
  muted?: boolean;
  assignMode: boolean;
  picked: string[];
  onPick: (next: string[]) => void;
  onToggle: (id: string, done: boolean) => void;
}) {
  if (tasks.length === 0 && !emptyText) return null;

  return (
    <section className="mb-5">
      <h2
        className={`mb-1 text-sm font-semibold ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {title}
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul
          className={`overflow-hidden rounded-card border border-border bg-surface ${
            muted ? "opacity-80" : ""
          }`}
        >
          {tasks.map((task) => {
            const isDone = task.status === "done";
            const isPicked = picked.includes(task.id);
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0"
              >
                {assignMode ? (
                  <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() =>
                        onPick(
                          isPicked
                            ? picked.filter((id) => id !== task.id)
                            : [...picked, task.id],
                        )
                      }
                      className="h-5 w-5"
                    />
                  </label>
                ) : (
                  <button
                    onClick={() => onToggle(task.id, !isDone)}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 ${
                      isDone
                        ? "border-accent-green bg-accent-green/20"
                        : "border-border hover:border-accent-green"
                    }`}
                    aria-label={
                      isDone ? `Vrátit ${task.name}` : `Splnit ${task.name}`
                    }
                  >
                    {isDone ? "✓" : <span className="h-5 w-5 rounded" />}
                  </button>
                )}
                <span className="grow">
                  <span
                    className={
                      isDone ? "text-muted-foreground line-through" : ""
                    }
                  >
                    {task.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {task.assignees.length > 0
                      ? task.assignees.map((a) => a.displayName).join(", ")
                      : "nepřiřazeno"}
                    {task.periodStart && task.periodEnd && (
                      <>
                        {" · "}
                        {formatRange(
                          new Date(`${task.periodStart}T00:00:00`),
                          new Date(`${task.periodEnd}T00:00:00`),
                        )}
                      </>
                    )}
                    {isDone && task.completedByName && (
                      <> · splněno: {task.completedByName}</>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
