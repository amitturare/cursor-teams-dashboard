import { getAuditLogs } from "../cursor-admin";
import { getDatesInRange, getStaleDates, groupIntoRanges, markSynced } from "../db/queries/sync-log";
import { getCoveredDates, upsertAuditLogs, queryAuditLogs } from "../db/queries/audit-logs";
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

  // Detect dates the sync_log considers fresh but are missing from the data table.
  const allDates = getDatesInRange(startDate, endDate);
  const coveredDates = await getCoveredDates(startDate, endDate);
  const uncoveredDates = allDates.filter((d) => !coveredDates.has(d));

  if (uncoveredDates.length > 0) {
    const ranges = groupIntoRanges(uncoveredDates);
    for (const range of ranges) {
      const startMs = new Date(range.start).getTime();
      const endMs = new Date(range.end + "T23:59:59Z").getTime();
      const logs = await getAuditLogs(startMs, endMs);
      await upsertAuditLogs(logs);
    }
    await markSynced("audit_logs", uncoveredDates);
  }

  return queryAuditLogs(startDate, endDate, options);
}
