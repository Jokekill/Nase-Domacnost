import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { bootstrapSnapshot, pullChanges } from "@/lib/sync/service";

export const runtime = "nodejs";

const querySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  bootstrap: z.enum(["true", "false"]).default("false"),
});

/**
 * Changes since a cursor, or a full snapshot for the first sync
 * (docs/SYNC.md §2).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const sp = req.nextUrl.searchParams;
  const query = querySchema.parse({
    cursor: sp.get("cursor") ?? undefined,
    limit: sp.get("limit") ?? undefined,
    bootstrap: sp.get("bootstrap") ?? undefined,
  });

  if (query.bootstrap === "true" || query.cursor === 0) {
    const snapshot = await bootstrapSnapshot(ctx);
    return NextResponse.json({ ...snapshot, bootstrap: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const result = await pullChanges(ctx, query.cursor, query.limit);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
});
