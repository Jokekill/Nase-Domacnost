import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resetRequestSchema } from "@/lib/schemas/auth";

export const POST = apiHandler(async (req: NextRequest) => {
  const input = resetRequestSchema.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  enforceRateLimit(`pwreset:${ip}`, { limit: 5 });

  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  const user = rows[0];

  if (user) {
    const token = generateToken();
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60_000), // 1 hour
    });
    // SMTP comes later — for now the reset link is logged to the server
    // console (docs/ARCHITECTURE.md §1.3).
    console.log(
      `[password-reset] user=${user.email} link=/reset-hesla?token=${token}`,
    );
  }

  // Always the same response — do not reveal whether the email exists.
  return NextResponse.json({ ok: true });
});
