import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../index";
import { syncLog } from "../schema";

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Returns dates (YYYY-MM-DD strings) in [startDate, endDate] range that are
 * either missing from sync_log or were last synced more than 1 hour ago.
 */
export async function getStaleDates(
  dataType: string,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const existing = await db
    .select({ date: syncLog.date, syncedAt: syncLog.syncedAt })
    .from(syncLog)
    .where(
      and(
        eq(syncLog.dataType, dataType),
        gte(syncLog.date, startDate),
        lte(syncLog.date, endDate)
      )
    );

  const freshDates = new Set<string>();
  const now = Date.now();
  for (const row of existing) {
    if (now - new Date(row.syncedAt).getTime() < STALE_THRESHOLD_MS) {
      freshDates.add(row.date);
    }
  }

  const allDates = getDatesInRange(startDate, endDate);
  return allDates.filter((d) => !freshDates.has(d));
}

/**
 * Marks the given dates as synced (upserts into sync_log).
 */
export async function markSynced(dataType: string, dates: string[]): Promise<void> {
  if (dates.length === 0) return;
  const now = new Date();
  await db
    .insert(syncLog)
    .values(dates.map((date) => ({ dataType, date, syncedAt: now })))
    .onConflictDoUpdate({
      target: [syncLog.dataType, syncLog.date],
      set: { syncedAt: now }
    });
}

/**
 * Groups an array of YYYY-MM-DD date strings into contiguous ranges.
 * E.g. ["2026-01-01","2026-01-02","2026-01-04"] → [{start:"2026-01-01",end:"2026-01-02"},{start:"2026-01-04",end:"2026-01-04"}]
 */
export function groupIntoRanges(dates: string[]): Array<{ start: string; end: string }> {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const ranges: Array<{ start: string; end: string }> = [];
  let rangeStart = sorted[0];
  let prev = sorted[0];

  const utcDay = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prevMs = utcDay(prev);
    const currMs = utcDay(curr);
    if (currMs - prevMs > 24 * 60 * 60 * 1000) {
      ranges.push({ start: rangeStart, end: prev });
      rangeStart = curr;
    }
    prev = curr;
  }
  ranges.push({ start: rangeStart, end: prev });
  return ranges;
}

export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const toUtcMidnight = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new RangeError("Invalid time value");
  }
  const curr = new Date(start);
  while (curr <= end) {
    dates.push(curr.toISOString().slice(0, 10));
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
}
