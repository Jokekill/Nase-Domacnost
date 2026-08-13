import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/schemas/auth";

export const POST = apiHandler(async (req: NextRequest) => {
  const input = loginSchema.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  enforceRateLimit(`login:${ip}:${input.email}`);

  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  const user = rows[0];

  const valid =
    user && !user.deletedAt
      ? await verifyPassword(user.passwordHash, input.password)
      : false;
  if (!valid) {
    throw new ApiError("unauthorized", "Nesprávný e-mail nebo heslo.");
  }

  await createSession(user!.id);
  return NextResponse.json({ id: user!.id });
});
