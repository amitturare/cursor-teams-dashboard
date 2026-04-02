import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://amitturare:root@localhost:5432/cursor_teams_dashboard"
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
