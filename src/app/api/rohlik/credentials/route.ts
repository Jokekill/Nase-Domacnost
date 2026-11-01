import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireAdmin, requireHousehold } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { rohlikCredentialsSchema } from "@/lib/schemas/rohlik";
import {
  deleteRohlikCredentials,
  getRohlikStatus,
  saveRohlikCredentials,
} from "@/lib/rohlik/credentials";

/**
 * Connecting the household's Rohlík account from Nastavení (D-030).
 *
 * The password is write-only: it goes in through PUT, is stored encrypted and
 * is never returned by anything here — GET answers with the e-mail and when
 * signing in last worked, which is all the screen needs.
 */

export const GET = apiHandler(async () => {
  // Readable by any member: the shopping screen explains why the basket
  // button is off, and that is not admin-only knowledge.
  const ctx = await requireHousehold();
  return NextResponse.json(await getRohlikStatus(ctx.householdId));
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const ctx = await requireAdmin();
  // Each save signs in for real. Our own limit, so a stuck form cannot walk
  // into Rohlík's.
  enforceRateLimit(`rohlik-login:${ctx.householdId}`, {
    limit: 8,
    windowMs: 10 * 60_000,
  });
  const input = rohlikCredentialsSchema.parse(await req.json());
  const status = await saveRohlikCredentials(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input,
  );
  return NextResponse.json(status);
});

export const DELETE = apiHandler(async () => {
  const ctx = await requireAdmin();
  await deleteRohlikCredentials({
    userId: ctx.user.id,
    householdId: ctx.householdId,
  });
  return NextResponse.json({ ok: true });
});
