import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { offByBarcode } from "@/lib/off/client";
import { enforceRateLimit } from "@/lib/rate-limit";

export const GET = apiHandler(
  async (_req: NextRequest, { params }: { params: Promise<{ code: string }> }) => {
    const ctx = await requireHousehold();
    const code = z
      .string()
      .regex(/^\d{6,14}$/, "Neplatný čárový kód.")
      .parse((await params).code);
    enforceRateLimit(`off-barcode:${ctx.user.id}`, {
      limit: 60,
      windowMs: 60_000,
    });
    const product = await offByBarcode(code);
    if (!product) {
      throw new ApiError(
        "not_found",
        "Tento čárový kód není v Open Food Facts. Můžeš potravinu zadat ručně.",
      );
    }
    return NextResponse.json(product);
  },
);
