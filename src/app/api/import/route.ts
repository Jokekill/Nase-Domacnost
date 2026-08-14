import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { applyImport, inspectImport } from "@/lib/transfer/import";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Two-phase import (docs/ARCHITECTURE.md §4.3): `mode=preview` validates and
 * reports, `mode=apply` writes. Admin only.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireAdmin();

  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "apply" ? "apply" : "preview";

  if (!(file instanceof File)) {
    throw new ApiError("validation_error", "Chybí soubor (pole `file`).");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("validation_error", "Archiv je větší než 500 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (mode === "preview") {
    const { preview } = await inspectImport(buffer);
    return NextResponse.json(preview);
  }

  const result = await applyImport(buffer, ctx.user.id);
  return NextResponse.json(result);
});
