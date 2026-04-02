import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../index";
import { usageEvents } from "../schema";
import type { UsageEvent } from "../../cursor-admin";

export async function upsertUsageEvents(events: UsageEvent[]): Promise<void> {
  if (events.length === 0) return;
  const now = new Date();

  const values = events
    .filter((e) => e.timestamp && e.userEmail)
    .map((e) => ({
      userEmail: e.userEmail!,
      timestamp: new Date(e.timestamp as string | number),
      model: e.model ?? null,
      kind: e.kind ?? null,
      data: e as unknown as Record<string, unknown>,
      syncedAt: now
    }));

  if (values.length === 0) return;

  await db
    .insert(usageEvents)
    .values(values)
    .onConflictDoNothing();
}

export async function queryUsageEvents(
  startDate: string,
  endDate: string,
  email?: string
): Promise<UsageEvent[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  const conditions = [gte(usageEvents.timestamp, start), lte(usageEvents.timestamp, end)];
  if (email) {
    conditions.push(eq(usageEvents.userEmail, email));
  }

  const rows = await db
    .select()
    .from(usageEvents)
    .where(and(...conditions));

  return rows.map((r) => ({
    ...(r.data as object),
    timestamp: r.timestamp.toISOString(),
    userEmail: r.userEmail,
    model: r.model ?? undefined,
    kind: r.kind ?? undefined
  })) as UsageEvent[];
}
