import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import {
  createCategory,
  listCategoryTree,
} from "@/lib/categories/service";
import { categoryUpsertSchema } from "@/lib/schemas/recipes";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await listCategoryTree(ctx.householdId);
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = categoryUpsertSchema.parse(await req.json());
  await createCategory(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input,
  );
  return NextResponse.json({ id: input.id }, { status: 201 });
});
