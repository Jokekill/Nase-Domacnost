import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { buildExportZip } from "@/lib/transfer/export";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Full export (admin only — it contains everyone's data, including personal
 * diaries and optionally password hashes).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const { buffer } = await buildExportZip({
    includeCredentials: sp.get("credentials") !== "false",
    includePhotos: sp.get("photos") !== "false",
  });

  const fileName = `nase-domacnost-export-${new Date()
    .toISOString()
    .slice(0, 10)}.zip`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
});
