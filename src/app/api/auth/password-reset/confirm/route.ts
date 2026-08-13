import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/passwords";
import { hashToken } from "@/lib/auth/tokens";
import { resetConfirmSchema } from "@/lib/schemas/auth";

export const POST = apiHandler(async (req: NextRequest) => {
  const input = resetConfirmSchema.parse(await req.json());
  const tokenHash = hashToken(input.token);

  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const reset = rows[0];
  if (!reset) {
    throw new ApiError("forbidden", "Odkaz je neplatný nebo vypršel.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, lastModifiedBy: reset.userId })
      .where(eq(users.id, reset.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, reset.id));
    // Invalidate all existing sessions after a password reset.
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
  });

  return NextResponse.json({ ok: true });
});
