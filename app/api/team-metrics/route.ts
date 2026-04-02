import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";
import type { MetricDefinition } from "@/lib/metric-definitions";
import { syncAndQueryDailyUsage } from "@/lib/sync/daily-usage";
import { syncAndQueryTeamMembers } from "@/lib/sync/team-members";
import { buildUserWindowMetrics, getSelectableWindows, resolveWindowSelection } from "@/lib/metrics";

const QuerySchema = z.object({
  window: z.string().optional()
});

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 60 * 60 * 1000;

type MetricRows = ReturnType<typeof buildUserWindowMetrics>;


type CachedMetricsResponse = {
  generatedAt: string;
  definitions: MetricDefinition[];
  rows: MetricRows;
  availableWindows: Array<{ id: string; label: string }>;
  selectedWindow: { id: string; label: string; startDate: number; endDate: number; totalDays: number };
  cached?: boolean;
};

const metricsCache = new Map<string, { expiresAt: number; value: CachedMetricsResponse }>();

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      window: request.nextUrl.searchParams.get("window") || undefined
    });

    const selectedWindow = resolveWindowSelection(query.window);
    const cacheKey = `window:${selectedWindow.id}`;
    const cached = metricsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.value, cached: true });
    }

    const startDateStr = new Date(selectedWindow.startDate).toISOString().slice(0, 10);
    const endDateStr = new Date(selectedWindow.endDate).toISOString().slice(0, 10);
    const [teamMembers, dailyUsageData] = await Promise.all([
      syncAndQueryTeamMembers(),
      syncAndQueryDailyUsage(startDateStr, endDateStr)
    ]);
    const rows = buildUserWindowMetrics({
      teamMembers,
      dailyUsageData,
      window: selectedWindow
    });

    const payload: CachedMetricsResponse = {
      generatedAt: new Date().toISOString(),
      definitions: METRIC_DEFINITIONS,
      rows,
      availableWindows: getSelectableWindows().map((window) => ({ id: window.id, label: window.label })),
      selectedWindow: { id: selectedWindow.id, label: selectedWindow.label, startDate: selectedWindow.startDate, endDate: selectedWindow.endDate, totalDays: selectedWindow.totalDays }
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
