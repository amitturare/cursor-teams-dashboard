import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { auditLogs } from "../schema";
import type { AuditLogEntry } from "../../cursor-admin";

export async function upsertAuditLogs(logs: AuditLogEntry[]): Promise<void> {
  if (logs.length === 0) return;
  const now = new Date();

  const values = logs
    .filter((l) => l.timestamp)
    .map((l) => ({
      userEmail: l.userEmail ?? null,
      eventType: l.eventType ?? null,
      timestamp: new Date(l.timestamp!),
      data: (l.eventData ?? {}) as Record<string, unknown>,
      syncedAt: now
    }));

  if (values.length === 0) return;

  await db.insert(auditLogs).values(values).onConflictDoNothing();
}

/** Returns the distinct YYYY-MM-DD dates (UTC) that have at least one audit log in the given range. */
export async function getCoveredDates(startDate: string, endDate: string): Promise<Set<string>> {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);
  const rows = await db
    .selectDistinct({ date: sql<string>`to_char(${auditLogs.timestamp} AT TIME ZONE 'UTC', 'YYYY-MM-DD')` })
    .from(auditLogs)
    .where(and(gte(auditLogs.timestamp, start), lte(auditLogs.timestamp, end)));
  return new Set(rows.map((r) => r.date));
}

export async function queryAuditLogs(
  startDate: string,
  endDate: string,
  options?: { email?: string; eventType?: string }
): Promise<AuditLogEntry[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  const conditions = [gte(auditLogs.timestamp, start), lte(auditLogs.timestamp, end)];
  if (options?.email) conditions.push(eq(auditLogs.userEmail, options.email));
  if (options?.eventType) conditions.push(eq(auditLogs.eventType, options.eventType));

  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions));

  return rows.map((r) => ({
    timestamp: r.timestamp.toISOString(),
    userEmail: r.userEmail ?? undefined,
    eventType: r.eventType ?? undefined,
    eventData: r.data as Record<string, unknown>
  }));
}
