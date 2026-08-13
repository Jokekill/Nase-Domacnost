import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { createShoppingList, listShoppingLists } from "@/lib/shopping/service";
import { shoppingListCreateSchema } from "@/lib/schemas/shopping";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await listShoppingLists(ctx.householdId);
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = shoppingListCreateSchema.parse(await req.json());
  await createShoppingList(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input,
  );
  return NextResponse.json({ id: input.id }, { status: 201 });
});
