import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamSettings } from "@/lib/db/schema";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: teamSettings.value })
    .from(teamSettings)
    .where(eq(teamSettings.key, key));
  return row?.value ?? null;
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(teamSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: teamSettings.key,
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` }
    });
}
