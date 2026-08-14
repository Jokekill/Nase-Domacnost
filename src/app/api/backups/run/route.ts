import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { requestManualBackup } from "@/lib/backups/service";

export const runtime = "nodejs";

/** Running a backup is an admin action (docs/ARCHITECTURE.md §2.1). */
export const POST = apiHandler(async () => {
  await requireAdmin();
  return NextResponse.json(await requestManualBackup());
});
