import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import {
  getRecipeAggregate,
  listRecipes,
  upsertRecipe,
} from "@/lib/recipes/service";
import {
  recipeListQuerySchema,
  recipeUpsertSchema,
} from "@/lib/schemas/recipes";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const sp = req.nextUrl.searchParams;
  const query = recipeListQuerySchema.parse({
    q: sp.get("q") ?? undefined,
    categoryId: sp.get("categoryId") ?? undefined,
    uncategorised: sp.get("uncategorised") ?? undefined,
    tagIds: sp.getAll("tagId").length ? sp.getAll("tagId") : undefined,
    difficulty: sp.get("difficulty") ?? undefined,
    maxTotalTime: sp.get("maxTotalTime") ?? undefined,
    includeFoodId: sp.get("includeFoodId") ?? undefined,
    excludeFoodId: sp.get("excludeFoodId") ?? undefined,
    includeFoodCategoryId: sp.get("includeFoodCategoryId") ?? undefined,
    excludeFoodCategoryId: sp.get("excludeFoodCategoryId") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });
  const result = await listRecipes(
    { userId: ctx.user.id, householdId: ctx.householdId },
    query,
  );
  return NextResponse.json(result);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = recipeUpsertSchema.parse(await req.json());

  // Client-generated id: a replay of the same POST returns the existing
  // aggregate instead of failing (docs/API.md conventions).
  const existing = await getRecipeAggregate(input.id).catch((e) => {
    if (e instanceof ApiError && e.code === "not_found") return null;
    throw e;
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const recipe = await upsertRecipe(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input,
    { isNew: true },
  );
  return NextResponse.json(recipe, { status: 201 });
});
