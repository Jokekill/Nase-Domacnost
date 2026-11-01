import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { rohlikSearchSchema } from "@/lib/schemas/rohlik";
import { searchProducts } from "@/lib/rohlik/client";

/** Manual product search, for the items the automatic match got wrong. */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireHousehold();
  const { q } = rohlikSearchSchema.parse({
    q: req.nextUrl.searchParams.get("q") ?? "",
  });
  const items = await searchProducts(q, 10);
  return NextResponse.json({ items });
});
