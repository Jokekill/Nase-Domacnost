"use client";

import { apiFetch } from "@/lib/api/client";
import { enqueue } from "./sync";

/**
 * Offline-capable mutations (docs/SYNC.md §6, priorities 2–4).
 *
 * Each one writes to the outbox and lets the sync layer deal with the network.
 * If IndexedDB is unavailable (private mode, ancient browser) we fall back to
 * the plain online endpoint rather than losing the action.
 */

export async function checkShoppingItem(
  itemId: string,
  checked: boolean,
): Promise<void> {
  try {
    await enqueue("shopping_items", itemId, {
      isChecked: checked,
      checkedAt: checked ? new Date().toISOString() : null,
    });
  } catch {
    await apiFetch(`/api/shopping-items/${itemId}/check`, {
      method: "POST",
      json: { checked },
    });
  }
}

export async function completeTask(
  taskId: string,
  done: boolean,
): Promise<void> {
  try {
    await enqueue("tasks", taskId, {
      status: done ? "done" : "open",
      completedAt: done ? new Date().toISOString() : null,
    });
  } catch {
    await apiFetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      json: { done },
    });
  }
}

/**
 * Deleting a diary entry. Writing a NEW entry stays online-only on purpose:
 * the nutrition snapshot is computed on the server and never trusted from the
 * client (D-022), and the push whitelist has no insert for `diary_entries`
 * (D-025). `deletedAt` travels in the payload so the mirror hides the row
 * immediately, not only after the next pull.
 */
export async function deleteDiaryEntry(entryId: string): Promise<void> {
  try {
    await enqueue(
      "diary_entries",
      entryId,
      { deletedAt: new Date().toISOString() },
      "delete",
    );
  } catch {
    await apiFetch(`/api/diary/entries/${entryId}`, { method: "DELETE" });
  }
}
