import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { foods } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

// Minimal Phase-2 surface: search + quick create from the recipe editor.
// Nutrition fields, units and OFF integration land in Phase 3.
const createFoodSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  foodCategoryId: z.string().uuid().nullish(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const conditions = [
    eq(foods.householdId, ctx.householdId),
    isNull(foods.deletedAt),
  ];
  if (q) {
    conditions.push(sql`(
      ${foods.searchNormalized} LIKE '%' || immutable_unaccent(lower(${q})) || '%'
      OR ${foods.searchNormalized} % immutable_unaccent(lower(${q}))
    )`);
  }
  const items = await db
    .select({
      id: foods.id,
      name: foods.name,
      foodCategoryId: foods.foodCategoryId,
    })
    .from(foods)
    .where(and(...conditions))
    .orderBy(
      q
        ? sql`similarity(${foods.searchNormalized}, immutable_unaccent(lower(${q}))) DESC`
        : asc(foods.name),
    )
    .limit(20);
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = createFoodSchema.parse(await req.json());
  await db
    .insert(foods)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      name: input.name,
      foodCategoryId: input.foodCategoryId ?? null,
      source: "manual",
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoNothing();
  return NextResponse.json({ id: input.id }, { status: 201 });
});
