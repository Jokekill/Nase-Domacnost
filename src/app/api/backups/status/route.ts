import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { backupsDirSize, getBackupStatus } from "@/lib/backups/service";

export const runtime = "nodejs";

/** Everyone in the household may see whether backups are running. */
export const GET = apiHandler(async () => {
  await requireHousehold();
  const [status, sizeBytes] = await Promise.all([
    getBackupStatus(),
    backupsDirSize(),
  ]);
  return NextResponse.json({ ...status, sizeBytes });
});
