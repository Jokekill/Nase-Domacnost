import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { destroySession } from "@/lib/auth/session";

export const POST = apiHandler(async () => {
  await destroySession();
  return NextResponse.json({ ok: true });
});
