import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { deleteCategory, updateCategory } from "@/lib/categories/service";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().uuid().nullish(),
  sortOrder: z.number().int().optional(),
  // Hidden = off the cookbook's front page only; the recipes stay findable.
  isHidden: z.boolean().optional(),
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const input = patchSchema.parse(await req.json());
  await updateCategory(
    { userId: ctx.user.id, householdId: ctx.householdId },
    id,
    input,
  );
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    await deleteCategory(
      { userId: ctx.user.id, householdId: ctx.householdId },
      id,
    );
    return NextResponse.json({ ok: true });
  },
);
