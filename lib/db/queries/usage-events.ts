import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { usageEvents } from "../schema";
import type { UsageEvent } from "../../cursor-admin";

export async function upsertUsageEvents(events: UsageEvent[]): Promise<void> {
  if (events.length === 0) return;
  const now = new Date();

  const values = events
    .filter((e) => {
      if (!e.timestamp || !e.userEmail) return false;
      return Number.isFinite(new Date(e.timestamp as string | number).getTime());
    })
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

/** Returns the distinct YYYY-MM-DD dates (UTC) that have at least one event in the given range, optionally filtered by email. */
export async function getCoveredDates(startDate: string, endDate: string, email?: string): Promise<Set<string>> {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);
  const conditions = [gte(usageEvents.timestamp, start), lte(usageEvents.timestamp, end)];
  if (email) conditions.push(eq(usageEvents.userEmail, email));
  const rows = await db
    .selectDistinct({ date: sql<string>`to_char(${usageEvents.timestamp} AT TIME ZONE 'UTC', 'YYYY-MM-DD')` })
    .from(usageEvents)
    .where(and(...conditions));
  return new Set(rows.map((r) => r.date));
}

export async function queryUsageEvents(
  startDate: string,
  endDate: string,
  email?: string
): Promise<UsageEvent[]> {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new RangeError("Invalid time value");
  }

  const conditions = [gte(usageEvents.timestamp, start), lte(usageEvents.timestamp, end)];
  if (email) {
    conditions.push(eq(usageEvents.userEmail, email));
  }

  const rows = await db
    .select()
    .from(usageEvents)
    .where(and(...conditions));

  return rows
    .filter((r) => Number.isFinite(r.timestamp.getTime()))
    .map((r) => ({
      ...(r.data as object),
      timestamp: r.timestamp.toISOString(),
      userEmail: r.userEmail,
      model: r.model ?? undefined,
      kind: r.kind ?? undefined
    })) as UsageEvent[];
}
