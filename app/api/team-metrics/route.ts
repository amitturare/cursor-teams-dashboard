import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { syncAndQueryDailyUsage } from "@/lib/sync/daily-usage";
import { syncAndQueryTeamMembers } from "@/lib/sync/team-members";
import { buildUserWindowMetrics, getSelectableWindows, resolveWindowSelection } from "@/lib/metrics";

const QuerySchema = z.object({
  window: z.string().optional()
});

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 60 * 60 * 1000;

type MetricRows = ReturnType<typeof buildUserWindowMetrics>;

type MetricDefinition = {
  name: string;
  tagline: string;
  formula: string;
  source: string;
  interpret: string;
};

type CachedMetricsResponse = {
  generatedAt: string;
  definitions: MetricDefinition[];
  rows: MetricRows;
  availableWindows: Array<{ id: string; label: string }>;
  selectedWindow: { id: string; label: string; startDate: number; endDate: number };
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
      definitions: [
        {
          name: "Favorite Model",
          tagline: "The AI model this user relied on most during the selected period",
          formula: "Most frequently appearing model across all daily rows in the window",
          source: "mostUsedModel field from the Cursor /teams/daily-usage-data API, recorded per user per day",
          interpret: "'default' means Cursor auto-selected the model. Named models (e.g. claude-4-sonnet-thinking, gpt-4o) mean the user explicitly switched. A user always showing 'default' is letting Cursor decide; a named model indicates intentional preference."
        },
        {
          name: "Usage",
          tagline: "Total number of AI interactions made during the selected window",
          formula: "agentRequests + composerRequests + chatRequests + cmdkUsages, summed across all days",
          source: "Four daily counters from /teams/daily-usage-data: Agent (multi-step tasks), Composer (inline generation), Chat (messages), Cmd+K (quick completions)",
          interpret: "The clearest signal of AI engagement. Higher = more interactions. Does not measure code quality or acceptance — just how much the user reached for AI assistance."
        },
        {
          name: "Productivity Score",
          tagline: "Lines of AI-suggested code accepted per request — did the AI save real work?",
          formula: "(acceptedLinesAdded + acceptedLinesDeleted) ÷ (agentRequests + composerRequests + chatRequests)",
          source: "acceptedLinesAdded, acceptedLinesDeleted, and request counts from /teams/daily-usage-data",
          interpret: "A score of 34 means ~34 lines of AI output were kept per request on average. 0 means requests were made but nothing was accepted. Scores above 50 are strong; very high scores (100+) often come from Agent mode scaffolding large files."
        },
        {
          name: "Agent Efficiency",
          tagline: "How often the user kept the Agent's output — a signal of agent trust and quality",
          formula: "totalAccepts ÷ agentRequests × 100",
          source: "totalAccepts and agentRequests fields from /teams/daily-usage-data",
          interpret: "67% means the agent's result was accepted 2 out of 3 times. Under 30% often means exploratory use or the agent isn't aligned to the codebase style. High efficiency (70%+) suggests the user and agent work well together."
        },
        {
          name: "Tab Efficiency",
          tagline: "How often Tab (autocomplete) suggestions were accepted when shown",
          formula: "totalTabsAccepted ÷ totalTabsShown × 100",
          source: "totalTabsAccepted and totalTabsShown fields from /teams/daily-usage-data",
          interpret: "Autocomplete fires on every keypress, so rates are naturally lower than Agent efficiency. 10–15% is typical; above 25% is excellent. Very low rates (<5%) may mean the user dismisses suggestions habitually or the model isn't well-calibrated to their style."
        },
        {
          name: "Adoption Rate",
          tagline: "How consistently the user engaged with Cursor AI across the window — daily habit vs. occasional use",
          formula: "Days where isActive = true ÷ total days in window × 100",
          source: "isActive boolean field from /teams/daily-usage-data — true when the user made at least one AI request that day",
          interpret: "100% means AI was used every single day. 43% on a 7-day window means 3 active days. A user can have high Usage but low Adoption (heavy use on select days) — the Trend sparkline in the table shows the day-by-day pattern."
        }
      ],
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
