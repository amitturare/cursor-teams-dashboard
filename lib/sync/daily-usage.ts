import { getDailyUsageData } from "../cursor-admin";
import { getDatesInRange, getStaleDates, groupIntoRanges, markSynced } from "../db/queries/sync-log";
import { getCoveredDates, upsertDailyUsageRows, queryDailyUsageRows } from "../db/queries/daily-usage";
import type { DailyUsageRow } from "../cursor-admin";

/**
 * Hybrid sync: detect stale/missing date ranges, fetch from Cursor API,
 * upsert into DB, then query and return from DB.
 *
 * Two-pass gap detection:
 *  1. sync_log stale/missing dates → standard fetch path.
 *  2. Dates that sync_log considers fresh but have no rows in DB (partial/broken sync)
 *     → force-fetch those specific dates from Cursor regardless of sync_log state.
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

  // Detect dates the sync_log considers fresh but are missing from the data table.
  const allDates = getDatesInRange(startDate, endDate);
  const coveredDates = await getCoveredDates(startDate, endDate);
  const uncoveredDates = allDates.filter((d) => !coveredDates.has(d));

  if (uncoveredDates.length > 0) {
    const ranges = groupIntoRanges(uncoveredDates);
    for (const range of ranges) {
      const startMs = new Date(range.start).getTime();
      const endMs = new Date(range.end + "T23:59:59Z").getTime();
      const rows = await getDailyUsageData(startMs, endMs);
      await upsertDailyUsageRows(rows);
    }
    await markSynced("daily_usage", uncoveredDates);
  }

  return queryDailyUsageRows(startDate, endDate);
}
