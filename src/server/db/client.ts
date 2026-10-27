import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ywsSql?: postgres.Sql; __ywsDb?: Db };

/** Lazy singleton: the connection is created on first use, not at import (so `next build` needs no DB). */
export function getSql(): postgres.Sql {
  if (!globalForDb.__ywsSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__ywsSql = postgres(url, { max: 10, connect_timeout: 5 });
  }
  return globalForDb.__ywsSql;
}

export function getDb(): Db {
  if (!globalForDb.__ywsDb) {
    globalForDb.__ywsDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__ywsDb;
}
