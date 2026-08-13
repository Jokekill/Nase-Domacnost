import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { db } from "@/db/client";
import { foodUnits, foods, recipeIngredients } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { foodPatchSchema } from "@/lib/schemas/foods";

type Params = { params: Promise<{ id: string }> };

async function loadFood(id: string, householdId: string) {
  const [food] = await db
    .select()
    .from(foods)
    .where(
      and(
        eq(foods.id, id),
        eq(foods.householdId, householdId),
        isNull(foods.deletedAt),
      ),
    )
    .limit(1);
  if (!food) throw new ApiError("not_found", "Potravina nenalezena.");
  return food;
}

export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const food = await loadFood(id, ctx.householdId);
  const units = await db
    .select()
    .from(foodUnits)
    .where(and(eq(foodUnits.foodId, id), isNull(foodUnits.deletedAt)));
  return NextResponse.json({
    ...food,
    units: units.map((u) => ({
      id: u.id,
      unit: u.unit,
      gramsPerUnit: u.gramsPerUnit,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  await loadFood(id, ctx.householdId);
  const input = foodPatchSchema.parse(await req.json());
  const { units, ...fields } = input;

  await db.transaction(async (tx) => {
    if (Object.keys(fields).length > 0) {
      await tx
        .update(foods)
        .set({ ...fields, lastModifiedBy: ctx.user.id })
        .where(eq(foods.id, id));
    }
    if (units) {
      const keptIds = units.map((u) => u.id).filter(Boolean) as string[];
      await tx
        .update(foodUnits)
        .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
        .where(
          and(
            eq(foodUnits.foodId, id),
            isNull(foodUnits.deletedAt),
            keptIds.length ? notInArray(foodUnits.id, keptIds) : sql`TRUE`,
          ),
        );
      for (const unit of units) {
        const unitId = unit.id ?? uuidv7();
        await tx
          .insert(foodUnits)
          .values({
            id: unitId,
            householdId: ctx.householdId,
            foodId: id,
            unit: unit.unit,
            gramsPerUnit: unit.gramsPerUnit,
            lastModifiedBy: ctx.user.id,
          })
          .onConflictDoUpdate({
            target: foodUnits.id,
            set: {
              unit: unit.unit,
              gramsPerUnit: unit.gramsPerUnit,
              deletedAt: null,
              lastModifiedBy: ctx.user.id,
            },
          });
      }
    }
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    await loadFood(id, ctx.householdId);

    const [used] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recipeIngredients)
      .where(
        and(
          eq(recipeIngredients.foodId, id),
          isNull(recipeIngredients.deletedAt),
        ),
      );
    if (used.count > 0) {
      throw new ApiError(
        "conflict",
        `Potravinu používá ${used.count} ingrediencí v receptech — nejdřív je uprav.`,
      );
    }

    await db
      .update(foods)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(eq(foods.id, id));
    return NextResponse.json({ ok: true });
  },
);
