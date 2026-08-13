import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { importFileSchema, previewImport, runImport } from "@/lib/recipes/import";

const bodySchema = z.object({
  mode: z.enum(["preview", "commit"]).default("preview"),
  file: importFileSchema,
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { mode, file } = bodySchema.parse(await req.json());

  if (mode === "preview") {
    return NextResponse.json(await previewImport(ctx.householdId, file));
  }
  const result = await runImport(
    { userId: ctx.user.id, householdId: ctx.householdId },
    file,
  );
  return NextResponse.json(result, { status: 201 });
});
