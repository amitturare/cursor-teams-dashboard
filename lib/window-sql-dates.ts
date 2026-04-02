const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Maps a {@link import("./metrics").TimeWindow} millis range to inclusive UTC `YYYY-MM-DD` strings for SQL
 * queries. `endMs` is exclusive (first instant after the last day), matching `lib/metrics.ts`.
 */
export function msWindowToInclusiveUtcDateStrings(
  startMs: number,
  endMsExclusive: number
): { start: string; end: string } {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMsExclusive)) {
    throw new RangeError("Invalid time value");
  }
  if (endMsExclusive <= startMs) {
    throw new RangeError("Invalid time value");
  }
  const lastDayMs = endMsExclusive - DAY_MS;
  if (lastDayMs < startMs) {
    throw new RangeError("Invalid time value");
  }
  const start = new Date(startMs);
  const endInclusive = new Date(lastDayMs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime())) {
    throw new RangeError("Invalid time value");
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: endInclusive.toISOString().slice(0, 10),
  };
}
