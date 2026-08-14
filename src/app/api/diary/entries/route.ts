import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { createDiaryEntry } from "@/lib/diary/service";
import { requireRecipeAccess } from "@/lib/recipes/access";
import { diaryEntryCreateSchema } from "@/lib/schemas/diary";

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = diaryEntryCreateSchema.parse(await req.json());
  // Same rule as everywhere else: a recipe id from the request goes through
  // the permission matrix before we read anything out of it.
  if (input.sourceKind === "recipe") {
    await requireRecipeAccess(ctx.user, input.recipeId, "view");
  }
  const result = await createDiaryEntry(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input,
  );
  return NextResponse.json(result, { status: 201 });
});
