import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDailyUsageData, getTeamMembers } from "@/lib/cursor-admin";
import { buildUserWindowMetrics, getSelectableWindows, resolveWindowSelection } from "@/lib/metrics";

const QuerySchema = z.object({
  window: z.string().optional(),
  months: z.coerce.number().int().min(1).max(24).optional()
});

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 5 * 60 * 1000;

type MetricRows = ReturnType<typeof buildUserWindowMetrics>;

type CachedMetricsResponse = {
  generatedAt: string;
  definitions: Record<string, string>;
  rows: MetricRows;
  availableWindows: Array<{ id: string; label: string }>;
  selectedWindow: { id: string; label: string; startDate: number; endDate: number };
  cached?: boolean;
};

const metricsCache = new Map<string, { expiresAt: number; value: CachedMetricsResponse }>();

function mapLegacyMonthsToWindow(months: number | undefined) {
  if (months === 1) {
    return "current-month";
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      window: request.nextUrl.searchParams.get("window") || undefined,
      months: request.nextUrl.searchParams.get("months") || undefined
    });

    const selectedWindow = resolveWindowSelection(query.window || mapLegacyMonthsToWindow(query.months));
    const cacheKey = `window:${selectedWindow.id}`;
    const cached = metricsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.value, cached: true });
    }

    const teamMembers = await getTeamMembers();
    const dailyUsageData = await getDailyUsageData(selectedWindow.startDate, selectedWindow.endDate);
    const rows = buildUserWindowMetrics({
      teamMembers,
      dailyUsageData,
      usageEvents: [],
      window: selectedWindow
    });

    const payload: CachedMetricsResponse = {
      generatedAt: new Date().toISOString(),
      definitions: {
        favoriteModel:
          "Based on Cursor daily usage data field `mostUsedModel` (documented in `/teams/daily-usage-data`). This dashboard picks the model that appears most often across the user's daily rows in the selected window.",
        usagePerUser:
          "Sum of documented daily usage fields `agentRequests + composerRequests + chatRequests` from `/teams/daily-usage-data`, aggregated across the selected window.",
        productivity:
          "Derived from documented daily usage fields: `(acceptedLinesAdded + acceptedLinesDeleted) / (agentRequests + composerRequests + chatRequests)`, aggregated across the selected window.",
        agentEfficiency:
          "Derived from documented daily usage fields: `totalAccepts / agentRequests`, using sums across the selected window.",
        tabEfficiency:
          "Derived from documented daily usage fields: `totalTabsAccepted / totalTabsShown`, using sums across the selected window.",
        adoption:
          "Based on documented daily usage field `isActive`. Adoption is `active days / total days in the selected window`."
      },
      rows,
      availableWindows: getSelectableWindows().map((window) => ({ id: window.id, label: window.label })),
      selectedWindow: { id: selectedWindow.id, label: selectedWindow.label, startDate: selectedWindow.startDate, endDate: selectedWindow.endDate }
    };

    metricsCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: payload
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    return NextResponse.json(
      {
        error: message,
        hint: "Verify CURSOR_ADMIN_API_KEY is set and your API key has team admin permissions"
      },
      { status: 500 }
    );
  }
}
