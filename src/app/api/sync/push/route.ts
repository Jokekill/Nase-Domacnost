import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { currentCursor, pushOps } from "@/lib/sync/service";

export const runtime = "nodejs";

const opSchema = z.object({
  opId: z.string().uuid(),
  entity: z.string().min(1).max(64),
  entityId: z.string().uuid(),
  op: z.enum(["insert", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()).default({}),
  clientTs: z.string().datetime(),
});

const bodySchema = z.object({
  ops: z.array(opSchema).max(200),
});

/** Batch of offline operations, idempotent by opId (docs/SYNC.md §3). */
export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { ops } = bodySchema.parse(await req.json());
  const results = await pushOps(ctx, ops);
  return NextResponse.json(
    { results, nextCursor: await currentCursor(ctx) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
