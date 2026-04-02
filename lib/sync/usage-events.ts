import { FILTERED_USAGE_EVENTS_MIN_GAP_MS, getUsageEvents, sleep, type UsageEvent } from "../cursor-admin";
import { getStaleDates, groupIntoRanges, markSynced } from "../db/queries/sync-log";
import { upsertUsageEvents, queryUsageEvents } from "../db/queries/usage-events";

/**
 * Serialize all filtered-usage-events sync work so parallel UI calls (quota chart, drill-down, etc.)
 * cannot burst past Cursor's per-team rate limit.
 */
let usageEventsSyncChain: Promise<unknown> = Promise.resolve();

export function syncAndQueryUsageEventsQueued(
  startDate: string,
  endDate: string,
  email?: string
): Promise<UsageEvent[]> {
  const run = usageEventsSyncChain.then(() => syncAndQueryUsageEvents(startDate, endDate, email));
  usageEventsSyncChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function syncAndQueryUsageEvents(
  startDate: string,
  endDate: string,
  email?: string
): Promise<UsageEvent[]> {
  const staleDates = await getStaleDates("usage_events", startDate, endDate);

  if (staleDates.length > 0) {
    const ranges = groupIntoRanges(staleDates);
    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i];
      const startMs = new Date(range.start).getTime();
      const endMs = new Date(range.end + "T23:59:59Z").getTime();
      const events = await getUsageEvents(startMs, endMs, email ? { email } : undefined);
      await upsertUsageEvents(events);
      if (i < ranges.length - 1) {
        await sleep(FILTERED_USAGE_EVENTS_MIN_GAP_MS);
      }
    }
    await markSynced("usage_events", staleDates);
  }

  return queryUsageEvents(startDate, endDate, email);
}
