import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import { foodUnits, foods } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { foodUpsertSchema } from "@/lib/schemas/foods";

// Quick create from the recipe editor keeps only name + group; the full
// nutrition form lives in Nastavení → Potraviny (foodUpsertSchema).
const createFoodSchema = foodUpsertSchema.partial().required({
  id: true,
  name: true,
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
      referenceUnit: foods.referenceUnit,
      energyKj: foods.energyKj,
      proteinG: foods.proteinG,
      carbsG: foods.carbsG,
      sugarsG: foods.sugarsG,
      fiberG: foods.fiberG,
      fatG: foods.fatG,
      satFatG: foods.satFatG,
      saltG: foods.saltG,
      densityGPerMl: foods.densityGPerMl,
      gramsPerPiece: foods.gramsPerPiece,
      divisiblePieces: foods.divisiblePieces,
      source: foods.source,
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
  const { units = [], ...fields } = input;

  await db.transaction(async (tx) => {
    await tx
      .insert(foods)
      .values({
        ...fields,
        id: input.id,
        name: input.name,
        householdId: ctx.householdId,
        source: fields.source ?? "manual",
        lastModifiedBy: ctx.user.id,
      })
      .onConflictDoNothing();
    if (units.length) {
      await tx.insert(foodUnits).values(
        units.map((u) => ({
          id: u.id ?? uuidv7(),
          householdId: ctx.householdId,
          foodId: input.id,
          unit: u.unit,
          gramsPerUnit: u.gramsPerUnit,
          lastModifiedBy: ctx.user.id,
        })),
      );
    }
  });
  return NextResponse.json({ id: input.id }, { status: 201 });
});
