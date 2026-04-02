import { getAuditLogs } from "../cursor-admin";
import { getStaleDates, groupIntoRanges, markSynced } from "../db/queries/sync-log";
import { upsertAuditLogs, queryAuditLogs } from "../db/queries/audit-logs";
import type { AuditLogEntry } from "../cursor-admin";

export async function syncAndQueryAuditLogs(
  startDate: string,
  endDate: string,
  options?: { email?: string; eventType?: string }
): Promise<AuditLogEntry[]> {
  const staleDates = await getStaleDates("audit_logs", startDate, endDate);

  if (staleDates.length > 0) {
    const ranges = groupIntoRanges(staleDates);
    for (const range of ranges) {
      const startMs = new Date(range.start).getTime();
      const endMs = new Date(range.end + "T23:59:59Z").getTime();
      const logs = await getAuditLogs(startMs, endMs);
      await upsertAuditLogs(logs);
    }
    await markSynced("audit_logs", staleDates);
  }

  return queryAuditLogs(startDate, endDate, options);
}
