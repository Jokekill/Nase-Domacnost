import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { db } from "@/db/client";
import { uploadsDir } from "@/lib/photos/storage";
import { EXPORT_TABLES } from "./tables";

export const EXPORT_FORMAT_VERSION = 1;

export type ExportOptions = {
  /** Password hashes let a restore keep working logins — see EXPORT-FORMAT.md. */
  includeCredentials: boolean;
  includePhotos: boolean;
};

/**
 * Full export as a ZIP: data.json + photos/ (docs/EXPORT-FORMAT.md).
 *
 * The whole database is exported, not just one household: there is exactly
 * one household (D-004) and a restore has to bring the users with it.
 */
export async function buildExportZip(
  options: ExportOptions,
): Promise<{ buffer: Buffer; stats: Record<string, number>; photoCount: number }> {
  const zip = new JSZip();
  const tables: Record<string, unknown[]> = {};
  const stats: Record<string, number> = {};

  for (const [name, table] of EXPORT_TABLES) {
    const rows = (await db.select().from(table)) as Record<string, unknown>[];
    const cleaned =
      name === "users" && !options.includeCredentials
        ? rows.map((row) => {
            const copy = { ...row };
            delete copy.passwordHash;
            return copy;
          })
        : rows;
    tables[name] = cleaned;
    stats[name] = cleaned.length;
  }

  const data = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Naše domácnost",
    includesCredentials: options.includeCredentials,
    includesPhotos: options.includePhotos,
    tables,
  };
  zip.file("data.json", JSON.stringify(data, null, 2));

  let photoCount = 0;
  if (options.includePhotos) {
    photoCount = await addPhotos(zip);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    // Photos are already compressed; level 6 is a fair trade on a Pi.
    compressionOptions: { level: 6 },
  });
  return { buffer, stats, photoCount };
}

/**
 * All variants are shipped (orig + thumb/card/full) so a restore does not have
 * to re-run sharp on a machine that may not have it.
 */
async function addPhotos(zip: JSZip): Promise<number> {
  const root = uploadsDir();
  let count = 0;
  for (const file of await walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    zip.file(`photos/${rel}`, await readFile(file));
    count++;
  }
  return count;
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // no uploads yet
  }
  const out: string[] = [];
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.isFile() && (await stat(p)).size > 0) out.push(p);
  }
  return out;
}
