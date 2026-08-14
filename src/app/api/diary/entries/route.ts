import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { createDiaryEntry } from "@/lib/diary/service";
import { diaryEntryCreateSchema } from "@/lib/schemas/diary";

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = diaryEntryCreateSchema.parse(await req.json());
  const result = await createDiaryEntry(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input,
  );
  return NextResponse.json(result, { status: 201 });
});
