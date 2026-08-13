import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the connection across Next.js hot reloads in development.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.pgClient ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
export type Db = typeof db;
