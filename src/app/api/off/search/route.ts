import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { offSearch } from "@/lib/off/client";
import { enforceRateLimit } from "@/lib/rate-limit";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const q = z
    .string()
    .trim()
    .min(2)
    .max(100)
    .parse(req.nextUrl.searchParams.get("q") ?? "");
  enforceRateLimit(`off-search:${ctx.user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  const items = await offSearch(q);
  if (items.length === 0) {
    throw new ApiError("not_found", "V Open Food Facts se nic nenašlo.");
  }
  return NextResponse.json({ items });
});
