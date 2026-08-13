import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { uuidv7 } from "uuidv7";
import * as schema from "./schema";

/**
 * Development seed: creates the test household with two users when the DB is
 * empty. Test logins: vojta@test.local / heslo123, eliska@test.local / heslo123.
 * Phase 3 adds the foods seed (seeds/foods.json) here.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (existing.length > 0) {
    console.log("Users already exist — skipping seed.");
    await client.end();
    return;
  }

  const passwordHash = await hash("heslo123", {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const householdId = uuidv7();
  const vojtaId = uuidv7();
  const eliskaId = uuidv7();

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values([
      {
        id: vojtaId,
        email: "vojta@test.local",
        passwordHash,
        displayName: "Vojta",
        lastModifiedBy: vojtaId,
      },
      {
        id: eliskaId,
        email: "eliska@test.local",
        passwordHash,
        displayName: "Eliška",
        lastModifiedBy: eliskaId,
      },
    ]);
    await tx.insert(schema.households).values({
      id: householdId,
      name: "Mykiskovi",
      lastModifiedBy: vojtaId,
    });
    await tx.insert(schema.householdMembers).values([
      { householdId, userId: vojtaId, role: "admin" },
      { householdId, userId: eliskaId, role: "member" },
    ]);
  });

  console.log("Seeded test household with users vojta@test.local and eliska@test.local.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
