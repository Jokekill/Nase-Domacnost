import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { households } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { renderCookbookPdf } from "@/lib/pdf/cookbook";
import { loadRecipesForPdf } from "@/lib/pdf/service";
import { requireRecipeAccess } from "@/lib/recipes/access";

// PDF rendering needs Node APIs (fonts from disk, sharp).
export const runtime = "nodejs";
// A whole cookbook with photos takes a while on a Raspberry Pi.
export const maxDuration = 120;

const bodySchema = z.object({
  recipeIds: z.array(z.string().uuid()).min(1).max(200),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { recipeIds } = bodySchema.parse(await req.json());

  // Every single recipe goes through the permission matrix (§8.2).
  for (const id of recipeIds) {
    await requireRecipeAccess(ctx.user, id, "view");
  }

  const [household] = await db
    .select({ name: households.name })
    .from(households)
    .where(eq(households.id, ctx.householdId))
    .limit(1);

  const recipes = await loadRecipesForPdf(recipeIds);
  const pdf = await renderCookbookPdf({
    householdName: household?.name ?? "Naše domácnost",
    recipes,
  });

  const fileName = `kucharka-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
});
