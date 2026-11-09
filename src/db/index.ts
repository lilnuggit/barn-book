import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  // Lets Vercel Fluid compute close idle connections before a function suspends.
  attachDatabasePool(pool);
  return pool;
}

const pool = (globalForDb.pgPool ??= createPool());

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
