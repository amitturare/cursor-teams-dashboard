import { getUsageEvents } from "../cursor-admin";
import { getStaleDates, groupIntoRanges, markSynced } from "../db/queries/sync-log";
import { upsertUsageEvents, queryUsageEvents } from "../db/queries/usage-events";
import type { UsageEvent } from "../cursor-admin";

export async function syncAndQueryUsageEvents(
  startDate: string,
  endDate: string,
  email?: string
): Promise<UsageEvent[]> {
  const staleDates = await getStaleDates("usage_events", startDate, endDate);

  if (staleDates.length > 0) {
    const ranges = groupIntoRanges(staleDates);
    for (const range of ranges) {
      const startMs = new Date(range.start).getTime();
      const endMs = new Date(range.end + "T23:59:59Z").getTime();
      const events = await getUsageEvents(startMs, endMs, email ? { email } : undefined);
      await upsertUsageEvents(events);
    }
    await markSynced("usage_events", staleDates);
  }

  return queryUsageEvents(startDate, endDate, email);
}
