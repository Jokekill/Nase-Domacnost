import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "unreachable" },
      { status: 503 },
    );
  }
}
