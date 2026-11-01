import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyRohlikCredentials } from "@/lib/rohlik/credentials";

/** "Ověřit znovu" in Nastavení: signs in with what is stored (D-030). */
export const POST = apiHandler(async () => {
  const ctx = await requireAdmin();
  enforceRateLimit(`rohlik-login:${ctx.householdId}`, {
    limit: 8,
    windowMs: 10 * 60_000,
  });
  const status = await verifyRohlikCredentials({
    userId: ctx.user.id,
    householdId: ctx.householdId,
  });
  return NextResponse.json(status);
});
