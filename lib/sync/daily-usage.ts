import { getDailyUsageData } from "../cursor-admin";
import { getStaleDates, groupIntoRanges, markSynced } from "../db/queries/sync-log";
import { upsertDailyUsageRows, queryDailyUsageRows } from "../db/queries/daily-usage";
import type { DailyUsageRow } from "../cursor-admin";

/**
 * Hybrid sync: detect stale/missing date ranges, fetch from Cursor API,
 * upsert into DB, then query and return from DB.
 */
export async function syncAndQueryDailyUsage(
  startDate: string,
  endDate: string
): Promise<DailyUsageRow[]> {
  const staleDates = await getStaleDates("daily_usage", startDate, endDate);

  if (staleDates.length > 0) {
    const ranges = groupIntoRanges(staleDates);
    for (const range of ranges) {
      const startMs = new Date(range.start).getTime();
      const endMs = new Date(range.end + "T23:59:59Z").getTime();
      const rows = await getDailyUsageData(startMs, endMs);
      await upsertDailyUsageRows(rows);
    }
    await markSynced("daily_usage", staleDates);
  }

  return queryDailyUsageRows(startDate, endDate);
}
