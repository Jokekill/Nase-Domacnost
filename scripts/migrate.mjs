// Migration runner for the production image.
//
// `src/db/migrate.ts` needs tsx and dotenv, neither of which belongs in the
// runtime image. This is the same thing in plain JS, resolved against the
// dependencies Next's standalone output already traced (drizzle-orm, postgres),
// so the image stays a runtime image.
//
// Used by the `migrate` service in docker-compose.yml — the app container never
// migrates on its own, so two app replicas could never race each other.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const folder = process.env.MIGRATIONS_DIR ?? "./migrations";
const client = postgres(url, { max: 1 });

try {
  await migrate(drizzle(client), { migrationsFolder: folder });
  console.log(`Migrace z ${folder} aplikovány.`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
