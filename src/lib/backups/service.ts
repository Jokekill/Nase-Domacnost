import { access, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { backupRuns } from "@/db/schema";

/** /data/backups in Docker; ./data/backups during development. */
export function backupsDir(): string {
  return process.env.BACKUPS_DIR ?? path.join(process.cwd(), "data", "backups");
}

const TRIGGER_FILE = ".trigger";
/** A successful backup older than this is highlighted in the UI (§4.1). */
const STALE_AFTER_HOURS = 48;

export type BackupStatus = Awaited<ReturnType<typeof getBackupStatus>>;

export async function getBackupStatus() {
  const runs = await db
    .select()
    .from(backupRuns)
    .orderBy(desc(backupRuns.startedAt))
    .limit(10);

  const lastOk = runs.find((r) => r.status === "ok") ?? null;
  const ageHours = lastOk?.finishedAt
    ? (Date.now() - lastOk.finishedAt.getTime()) / 3_600_000
    : null;

  return {
    runs,
    lastOk,
    isStale: ageHours === null || ageHours > STALE_AFTER_HOURS,
    /** True while the sidecar has not picked the manual request up yet. */
    pendingTrigger: await fileExists(path.join(backupsDir(), TRIGGER_FILE)),
    /** False when nothing ever wrote a run — usually a missing sidecar. */
    sidecarSeen: runs.length > 0,
  };
}

/**
 * Asks the sidecar for a backup by dropping a trigger file it polls once a
 * minute (docs/ARCHITECTURE.md §4.2). The app never runs pg_dump itself: it
 * has neither the client binaries nor access to the uploads volume in
 * production.
 */
export async function requestManualBackup(): Promise<{ queued: true }> {
  const dir = backupsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, TRIGGER_FILE),
    `${new Date().toISOString()}\n`,
    "utf8",
  );
  return { queued: true };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Size of the backup directory, for the Settings screen. */
export async function backupsDirSize(): Promise<number | null> {
  try {
    const s = await stat(backupsDir());
    return s.isDirectory() ? await dirSize(backupsDir()) : null;
  } catch {
    return null;
  }
}

async function dirSize(dir: string): Promise<number> {
  const { readdir } = await import("node:fs/promises");
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(p);
    else if (entry.isFile()) total += (await stat(p)).size;
  }
  return total;
}
