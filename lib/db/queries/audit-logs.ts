import { and, eq, gte, lte } from "drizzle-orm";
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
