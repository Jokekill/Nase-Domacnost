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
