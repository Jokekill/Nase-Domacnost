import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { completeSchema } from "@/lib/schemas/tasks";
import { setTaskCompletion } from "@/lib/tasks/service";

type Params = { params: Promise<{ id: string }> };

/** Idempotent — anyone in the household may tick any task off (§10.5). */
export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const { done } = completeSchema.parse(await req.json());
  await setTaskCompletion(
    { userId: ctx.user.id, householdId: ctx.householdId },
    id,
    done,
  );
  return NextResponse.json({ ok: true });
});
