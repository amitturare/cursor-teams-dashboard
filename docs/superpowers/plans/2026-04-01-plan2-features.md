# Plan 2: Coditas Theme + Charts + Overall Score + Metric Definitions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Coditas branding, two fixed charts (AI Committed vs Prompts, Quota), an Overall Score column, and a Metric Definitions panel — all built on top of the Plan 1 database.

**Architecture:** All chart data comes from `UserWindowMetricRow[]` already returned by `/api/team-metrics` (Plan 1). A new `team_settings` table stores the admin-configurable quota cap. A new `/api/daily-usage` route serves per-user daily rows for the usage events drawer. Theme is applied entirely via CSS variable swaps in `globals.css` — no component rewrites.

**Tech Stack:** Next.js, TypeScript, pure SVG charts (no chart library), Drizzle ORM, PostgreSQL, Google Fonts (Urbanist + Inter)

**Prerequisite:** Plan 1 must be fully executed. `daily_usage_rows`, `sync_log`, and all Plan 1 tables must exist in `cursor_teams_dashboard`.

---

## File Map

**Created:**
- `lib/metric-definitions.ts` — single source of truth for all 9 metric definitions
- `lib/db/queries/settings.ts` — get/upsert for team_settings table
- `lib/sync/settings.ts` — helper to get quota cap with default fallback
- `app/api/settings/route.ts` — GET + POST /api/settings
- `app/api/daily-usage/route.ts` — GET /api/daily-usage?window=&email=
- `components/widgets/AICommittedChart.tsx` — dual-axis SVG chart (accepted lines + prompts)
- `components/widgets/QuotaChart.tsx` — bar chart with weekday/weekend + anomaly coloring
- `components/widgets/MetricDefinitionsPanel.tsx` — expandable glossary panel
- `components/widgets/OverallScorePill.tsx` — color-coded pill + hover tooltip breakdown

**Modified:**
- `lib/db/schema.ts` — add `teamSettings` table
- `lib/metrics.ts` — extend `DailyTrendPoint`, add `overallScore` to `UserWindowMetricRow`
- `app/layout.tsx` — add Google Fonts link tag
- `app/globals.css` — swap CSS variables to Coditas palette, add theme classes
- `components/dashboard.tsx` — replace placeholders, add overall score column, quota cap state, definitions panel, per-user quota drawer section

---

## Task 1: Add team_settings table to schema and migrate

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add teamSettings table to schema**

In `lib/db/schema.ts`, add after the `syncLog` table:

```ts
export const teamSettings = pgTable("team_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

Also add the import for `primaryKey` — check that `text` and `timestamp` are already imported. The full import line should be:

```ts
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  unique
} from "drizzle-orm/pg-core";
```

(`primaryKey` is not needed — `text("key").primaryKey()` uses the column's own `.primaryKey()` method.)

- [ ] **Step 2: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: new migration file created, applied without errors.

- [ ] **Step 3: Seed the quota cap default**

```bash
psql -U amitturare -h localhost -p 5432 cursor_teams_dashboard \
  -c "INSERT INTO team_settings (key, value, updated_at) VALUES ('quota_cap', '500', now()) ON CONFLICT (key) DO NOTHING;"
```

Expected: `INSERT 0 1` or `INSERT 0 0` (if already exists).

- [ ] **Step 4: Verify**

```bash
psql -U amitturare -h localhost -p 5432 cursor_teams_dashboard \
  -c "SELECT * FROM team_settings;"
```

Expected: one row with `key=quota_cap`, `value=500`.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add team_settings table for quota cap"
```

---

## Task 2: Settings DB query module

**Files:**
- Create: `lib/db/queries/settings.ts`

- [ ] **Step 1: Create `lib/db/queries/settings.ts`**

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamSettings } from "@/lib/db/schema";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: teamSettings.value })
    .from(teamSettings)
    .where(eq(teamSettings.key, key));
  return row?.value ?? null;
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(teamSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: teamSettings.key,
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` }
    });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/settings.ts
git commit -m "feat: settings DB query module"
```

---

## Task 3: /api/settings route

**Files:**
- Create: `app/api/settings/route.ts`

- [ ] **Step 1: Create `app/api/settings/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSetting, upsertSetting } from "@/lib/db/queries/settings";

const ALLOWED_KEYS = ["quota_cap"] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

const UpsertSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string().min(1)
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key || !ALLOWED_KEYS.includes(key as SettingKey)) {
      return NextResponse.json({ error: `key must be one of: ${ALLOWED_KEYS.join(", ")}` }, { status: 400 });
    }
    const value = await getSetting(key);
    return NextResponse.json({ key, value: value ?? "500", updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = UpsertSchema.parse(await request.json());
    await upsertSetting(body.key, body.value);
    return NextResponse.json({ key: body.key, value: body.value });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Verify endpoint**

```bash
npm run dev &
sleep 3
curl "http://localhost:3000/api/settings?key=quota_cap"
```

Expected: `{"key":"quota_cap","value":"500","updatedAt":"..."}`

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key":"quota_cap","value":"600"}'
```

Expected: `{"key":"quota_cap","value":"600"}`

- [ ] **Step 4: Commit**

```bash
git add app/api/settings/
git commit -m "feat: /api/settings route for quota cap management"
```

---

## Task 4: /api/daily-usage route

**Files:**
- Create: `app/api/daily-usage/route.ts`

- [ ] **Step 1: Create `app/api/daily-usage/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveWindowSelection } from "@/lib/metrics";
import { queryDailyUsageRows } from "@/lib/db/queries/daily-usage";

const QuerySchema = z.object({
  window: z.string().optional(),
  email: z.string().email().optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      window: request.nextUrl.searchParams.get("window") || undefined,
      email: request.nextUrl.searchParams.get("email") || undefined
    });

    const selectedWindow = resolveWindowSelection(query.window);
    const allRows = await queryDailyUsageRows(selectedWindow.startDate, selectedWindow.endDate);

    const rows = query.email
      ? allRows.filter((r) => r.email === query.email)
      : allRows;

    return NextResponse.json({
      rows,
      window: { id: selectedWindow.id, label: selectedWindow.label }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/daily-usage/
git commit -m "feat: /api/daily-usage route for per-user quota drawer"
```

---

## Task 5: Metric definitions — single source of truth

**Files:**
- Create: `lib/metric-definitions.ts`
- Modify: `app/api/team-metrics/route.ts` — import from shared module

- [ ] **Step 1: Create `lib/metric-definitions.ts`**

```ts
export interface MetricDefinition {
  name: string;
  unit: string;
  tagline: string;
  formula: string;
  source: string;
  interpret: string;
  warning?: string;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    name: "Usage",
    unit: "requests",
    tagline: "Total number of AI interactions made during the selected window",
    formula: "agentRequests + composerRequests + chatRequests + cmdkUsages, summed across all days",
    source: "Four daily counters from /teams/daily-usage-data: agentRequests, composerRequests, chatRequests, cmdkUsages",
    interpret:
      "The clearest signal of AI engagement. Higher = more interactions. Does not measure code quality or acceptance — just how much the user reached for AI assistance."
  },
  {
    name: "Productivity Score",
    unit: "lines / request",
    tagline: "Lines of AI-suggested code accepted per request — did the AI save real work?",
    formula: "(acceptedLinesAdded + acceptedLinesDeleted) ÷ (agentRequests + composerRequests + chatRequests)",
    source: "acceptedLinesAdded, acceptedLinesDeleted, agentRequests, composerRequests, chatRequests from /teams/daily-usage-data",
    interpret:
      "A score of 34 means ~34 lines of AI output were kept per request on average. 0 means requests were made but nothing was accepted. Scores above 50 are strong; very high scores (100+) often come from Agent mode scaffolding large files."
  },
  {
    name: "Agent Efficiency",
    unit: "%",
    tagline: "How often the user kept the Agent's output — a signal of agent trust and quality",
    formula: "totalAccepts ÷ agentRequests × 100",
    source: "totalAccepts and agentRequests from /teams/daily-usage-data",
    interpret:
      "67% means the agent's result was accepted 2 out of 3 times. Under 30% often means exploratory use or the agent isn't aligned to the codebase style. High efficiency (70%+) suggests the user and agent work well together."
  },
  {
    name: "Tab Efficiency",
    unit: "%",
    tagline: "How often Tab (autocomplete) suggestions were accepted when shown",
    formula: "totalTabsAccepted ÷ totalTabsShown × 100",
    source: "totalTabsAccepted and totalTabsShown from /teams/daily-usage-data",
    interpret:
      "Autocomplete fires on every keypress, so rates are naturally lower than Agent efficiency. 10–15% is typical; above 25% is excellent. Very low rates (<5%) may mean the user dismisses suggestions habitually."
  },
  {
    name: "Adoption Rate",
    unit: "%",
    tagline: "How consistently the user engaged with Cursor AI across the window — daily habit vs. occasional use",
    formula: "Days where isActive = true ÷ total days in window × 100",
    source: "isActive boolean from /teams/daily-usage-data — true when the user made at least one AI request that day",
    interpret:
      "100% means AI was used every single day. 43% on a 7-day window means 3 active days. A user can have high Usage but low Adoption (heavy use on select days)."
  },
  {
    name: "Favorite Model",
    unit: "model name",
    tagline: "The AI model this user relied on most during the selected period",
    formula: "Most frequently appearing model across all daily rows in the window",
    source: "mostUsedModel field from /teams/daily-usage-data, recorded per user per day",
    interpret:
      "'default' means Cursor auto-selected the model. Named models (e.g. claude-4-sonnet-thinking, gpt-4o) mean the user explicitly switched."
  },
  {
    name: "Overall Score",
    unit: "score 0–100",
    tagline: "A balanced composite of all five engagement and quality signals",
    formula:
      "(adoptionRate × 0.30 + tabEfficiency × 0.20 + agentEfficiency × 0.20 + min(productivityScore/100, 1) × 0.20 + usageNorm × 0.10) × 100  where usageNorm = usageCount ÷ max(usageCount across team)",
    source: "All fields from /teams/daily-usage-data via computed metrics",
    interpret:
      "75–100 = Excellent: consistent, high-quality AI usage. 50–74 = Good: solid adopter with room to improve. 25–49 = Fair: occasional or low-quality usage. 0–24 = Low: minimal AI integration."
  },
  {
    name: "AI Code Acceptance",
    unit: "accepted lines / day, prompts / day",
    tagline: "Daily AI-suggested code that was kept, plotted against total prompts made",
    formula:
      "Bars: acceptedLinesAdded + acceptedLinesDeleted per day. Line: agentRequests + composerRequests + chatRequests + cmdkUsages per day",
    source: "acceptedLinesAdded, acceptedLinesDeleted, agentRequests, composerRequests, chatRequests, cmdkUsages from /teams/daily-usage-data",
    interpret:
      "High bars with low line = AI output is high quality and accepted efficiently. High line with low bars = many prompts but little accepted code — signals friction or exploratory usage."
  },
  {
    name: "Quota Utilisation",
    unit: "requests / day",
    tagline: "Daily consumption of subscription-included requests vs. the configured monthly quota cap",
    formula: "Sum of subscriptionIncludedReqs across all team members per calendar day",
    source: "subscriptionIncludedReqs from /teams/daily-usage-data",
    interpret:
      "Weekday bars (violet) show normal working usage. Weekend bars (grey) should be low. Bars exceeding 30% of monthly quota on a single day are flagged red as anomalies.",
    warning:
      "subscriptionIncludedReqs counts raw usage events, NOT billable request units. Do not use for cost calculations. For accurate billing data, use /teams/filtered-usage-events and sum chargedCents."
  }
];
```

- [ ] **Step 2: Update `app/api/team-metrics/route.ts` to import from shared module**

Replace the inline `definitions` array in the payload with the shared module. At the top of `app/api/team-metrics/route.ts`, add:

```ts
import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";
```

Remove the `MetricDefinition` type definition from that file (it's now in `lib/metric-definitions.ts`). In the payload object, replace:

```ts
definitions: [
  { name: "Favorite Model", ... },
  // ... all the inline objects
],
```

With:

```ts
definitions: METRIC_DEFINITIONS,
```

Also update the `CachedMetricsResponse` type to use the imported type:

```ts
import type { MetricDefinition } from "@/lib/metric-definitions";
```

And remove the local `type MetricDefinition = { ... }` block.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/metric-definitions.ts app/api/team-metrics/route.ts
git commit -m "feat: metric-definitions single source of truth (9 metrics)"
```

---

## Task 6: Extend metrics.ts — DailyTrendPoint + overallScore

**Files:**
- Modify: `lib/metrics.ts`

- [ ] **Step 1: Extend DailyTrendPoint interface**

In `lib/metrics.ts`, replace the `DailyTrendPoint` interface (lines 11–15):

```ts
export interface DailyTrendPoint {
  date: string;
  usageCount: number;
  isActive: boolean;
  acceptedLines: number; // acceptedLinesAdded + acceptedLinesDeleted for that day
  prompts: number;       // agentRequests + composerRequests + chatRequests + cmdkUsages for that day
}
```

- [ ] **Step 2: Add overallScore to UserWindowMetricRow**

In `lib/metrics.ts`, add `overallScore: number` to the `UserWindowMetricRow` interface after `dailyTrend`:

```ts
export interface UserWindowMetricRow {
  windowId: string;
  windowLabel: string;
  userEmail: string;
  userName: string;
  role: string;
  isRemoved: boolean;
  favoriteModel: string;
  usageCount: number;
  productivityScore: number;
  agentEfficiency: number;
  tabEfficiency: number;
  adoptionRate: number;
  overallScore: number; // NEW: composite 0–100
  dailyTrend: DailyTrendPoint[];
}
```

- [ ] **Step 3: Track acceptedLines and prompts per day in Accumulator**

In `lib/metrics.ts`, update the `dailyData` map type in the `Accumulator` interface:

```ts
dailyData: Map<string, { usageCount: number; isActive: boolean; acceptedLines: number; prompts: number }>;
```

- [ ] **Step 4: Update buildDailyTrend to populate new fields**

Replace `buildDailyTrend` function:

```ts
function buildDailyTrend(
  dailyData: Map<string, { usageCount: number; isActive: boolean; acceptedLines: number; prompts: number }>,
  startDate: number,
  endDate: number
): DailyTrendPoint[] {
  const points: DailyTrendPoint[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;
  let cursor = startDate;
  while (cursor < endDate) {
    const dk = dayKey(cursor);
    const entry = dailyData.get(dk);
    points.push({
      date: dk,
      usageCount: entry?.usageCount ?? 0,
      isActive: entry?.isActive ?? false,
      acceptedLines: entry?.acceptedLines ?? 0,
      prompts: entry?.prompts ?? 0
    });
    cursor += oneDayMs;
  }
  return points;
}
```

- [ ] **Step 5: Populate acceptedLines and prompts in the accumulation loop**

In `buildUserWindowMetrics`, find the section that sets `target.dailyData` (around line 273–279). Replace it with:

```ts
const dk = dayKey(row.date);
const dayUsage = n(row.agentRequests) + n(row.composerRequests) + n(row.chatRequests) + n(row.cmdkUsages);
const dayAccepted = n(row.acceptedLinesAdded) + n(row.acceptedLinesDeleted);
const prevDay = target.dailyData.get(dk);
target.dailyData.set(dk, {
  usageCount: (prevDay?.usageCount ?? 0) + dayUsage,
  isActive: (prevDay?.isActive ?? false) || Boolean(row.isActive),
  acceptedLines: (prevDay?.acceptedLines ?? 0) + dayAccepted,
  prompts: (prevDay?.prompts ?? 0) + dayUsage
});
```

- [ ] **Step 6: Add overallScore computation with second pass**

Replace the `return Array.from(acc.values()).map(...)` block at the end of `buildUserWindowMetrics` with:

```ts
// First pass: build rows without overallScore
const rows = Array.from(acc.values()).map((item): Omit<UserWindowMetricRow, "overallScore"> => {
  const totalAiRequests = item.agentRequests + item.composerRequests + item.chatRequests + item.cmdkRequests;
  const acceptedLines = item.acceptedLinesAdded + item.acceptedLinesDeleted;

  return {
    windowId: item.windowId,
    windowLabel: item.windowLabel,
    userEmail: item.userEmail,
    userName: item.userName,
    role: item.role,
    isRemoved: item.isRemoved,
    favoriteModel: pickFavoriteModel(item.modelCounts),
    usageCount: totalAiRequests,
    productivityScore: Number((acceptedLines / Math.max(totalAiRequests, 1)).toFixed(2)),
    agentEfficiency: Number((item.totalAccepts / Math.max(item.agentRequests, 1)).toFixed(2)),
    tabEfficiency: Number((item.totalTabsAccepted / Math.max(item.totalTabsShown, 1)).toFixed(2)),
    adoptionRate: Number((item.activeDays.size / Math.max(params.window.totalDays, 1)).toFixed(2)),
    dailyTrend: buildDailyTrend(item.dailyData, params.window.startDate, params.window.endDate)
  };
});

// Second pass: compute overallScore (needs team max usage for normalization)
const maxUsage = Math.max(...rows.map((r) => r.usageCount), 1);

return rows
  .map((row): UserWindowMetricRow => {
    const usageNorm = row.usageCount / maxUsage;
    const productivityNorm = Math.min(row.productivityScore / 100, 1);
    const overallScore = Number(
      (
        (row.adoptionRate * 0.30 +
          row.tabEfficiency * 0.20 +
          row.agentEfficiency * 0.20 +
          productivityNorm * 0.20 +
          usageNorm * 0.10) *
        100
      ).toFixed(1)
    );
    return { ...row, overallScore };
  })
  .sort((a, b) => b.overallScore - a.overallScore); // default sort by score desc
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/metrics.ts
git commit -m "feat: extend DailyTrendPoint, add overallScore to UserWindowMetricRow"
```

---

## Task 7: Apply Coditas theme

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add Google Fonts to layout.tsx**

Replace the entire content of `app/layout.tsx`:

```ts
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI SparkLine — Coditas",
  description: "Team usage insights for Cursor"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Urbanist:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace CSS variables with Coditas palette**

In `app/globals.css`, replace the `:root` block (lines 1–8) with:

```css
:root {
  /* Coditas Brand Colors */
  --coditas-violet: #9900E6;
  --coditas-turquoise: #11CAE6;
  --coditas-red: #FF174F;
  --coditas-purple: #5B0FFE;

  /* Semantic mappings (replaces old --bg, --card, --text, etc.) */
  --bg: #f5f5f5;
  --card: #ffffff;
  --text: #171717;
  --muted: #736A85;
  --line: #EBE9EF;
  --error: #FF174F;
  --accent: #9900E6;
  --accent-secondary: #11CAE6;

  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #9900E6, #11CAE6);
  --gradient-alt: linear-gradient(135deg, #9900E6, #FF174F);

  /* Typography */
  --font-heading: 'Urbanist', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

- [ ] **Step 3: Update body font and background**

In `app/globals.css`, replace the `html, body` block:

```css
html,
body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}
```

- [ ] **Step 4: Update sidebar to use Coditas logo**

In `app/globals.css`, replace `.sidebarLogo`:

```css
.sidebarLogo {
  width: 120px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.sidebarLogoImg {
  height: 28px;
  width: auto;
  object-fit: contain;
}
```

In `app/globals.css`, update sidebar background to use brand grey:

```css
.sidebar {
  position: sticky;
  top: 0;
  width: 160px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  gap: 8px;
  border-right: 1px solid var(--line);
  background: #ffffff;
  flex-shrink: 0;
  z-index: 10;
}
```

- [ ] **Step 5: Update active states and headings to use Coditas colors**

Add these rules to the end of `app/globals.css`:

```css
/* Coditas Theme Overrides */

h1, h2, h3 {
  font-family: var(--font-heading);
}

.windowChip.active {
  background: var(--coditas-violet);
  color: #ffffff;
}

.windowChip:hover {
  background: rgba(153, 0, 230, 0.08);
  color: var(--coditas-violet);
}

.sidebarBtnActive {
  background: var(--coditas-violet);
  color: #ffffff;
}

.sidebarBtnActive:hover {
  background: #7a00b8;
  color: #ffffff;
}

.sidebarBtn:hover {
  background: rgba(153, 0, 230, 0.08);
  color: var(--coditas-violet);
}

/* Table header tint */
thead tr {
  background: rgba(153, 0, 230, 0.04);
}

/* Page title gradient text */
.pageTitle {
  font-family: var(--font-heading);
  font-weight: 800;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Sparklines */
.sparkline polyline,
.sparkline path {
  stroke: var(--coditas-turquoise);
}

/* Widget bar fill */
.widgetChartSvg rect {
  fill: var(--coditas-violet);
}
```

- [ ] **Step 6: Update the sidebarLogo in dashboard.tsx to use Coditas logo image**

Find the sidebarLogo in `components/dashboard.tsx`. It currently renders as a text abbreviation. Replace it with:

```tsx
<div className="sidebarLogo">
  <img
    src="https://coditas-brand-assets.web.app/logos/gradient.png"
    alt="Coditas"
    className="sidebarLogoImg"
  />
</div>
```

- [ ] **Step 7: Add pageTitle class to the h1 in dashboard.tsx**

Find the `<h1>` tag in `dashboard.tsx` that renders the page/app title. Add `className="pageTitle"` to it.

- [ ] **Step 8: Typecheck and visually verify**

```bash
npm run typecheck
npm run dev
```

Open `http://localhost:3000`. Verify:
- Coditas gradient logo appears in sidebar
- Page title has violet→turquoise gradient text
- Active window chip is violet
- Table header has subtle violet tint
- Sparklines are turquoise

- [ ] **Step 9: Commit**

```bash
git add app/layout.tsx app/globals.css components/dashboard.tsx
git commit -m "feat: apply Coditas brand theme — colors, typography, logo"
```

---

## Task 8: AICommittedChart component

**Files:**
- Create: `components/widgets/AICommittedChart.tsx`

- [ ] **Step 1: Create `components/widgets/AICommittedChart.tsx`**

```tsx
import { useMemo, useState } from "react";
import type { UserWindowMetricRow, TimeWindow } from "@/lib/metrics";

interface AICommittedChartProps {
  rows: UserWindowMetricRow[];
  window: TimeWindow;
}

const CHART_H = 120;
const CHART_W = 300;
const PAD = { top: 8, right: 8, bottom: 24, left: 40 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

export function AICommittedChart({ rows, window }: AICommittedChartProps) {
  const [viewMode, setViewMode] = useState<"team" | string>("team");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const userOptions = useMemo(
    () => rows.filter((r) => !r.isRemoved).map((r) => ({ email: r.userEmail, name: r.userName })),
    [rows]
  );

  // Aggregate daily data across visible users (team) or single user
  const dailyPoints = useMemo(() => {
    const filtered = viewMode === "team" ? rows : rows.filter((r) => r.userEmail === viewMode);
    const map = new Map<string, { acceptedLines: number; prompts: number }>();
    for (const row of filtered) {
      for (const pt of row.dailyTrend) {
        const existing = map.get(pt.date) ?? { acceptedLines: 0, prompts: 0 };
        map.set(pt.date, {
          acceptedLines: existing.acceptedLines + pt.acceptedLines,
          prompts: existing.prompts + pt.prompts
        });
      }
    }
    // Ensure sorted by date
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [rows, viewMode]);

  const maxAccepted = Math.max(...dailyPoints.map((p) => p.acceptedLines), 1);
  const maxPrompts = Math.max(...dailyPoints.map((p) => p.prompts), 1);
  const n = dailyPoints.length || 1;
  const barW = Math.max(2, (INNER_W / n) * 0.6);
  const step = INNER_W / n;

  const barX = (i: number) => PAD.left + i * step + step / 2 - barW / 2;
  const barH = (val: number) => (val / maxAccepted) * INNER_H;
  const lineY = (val: number) => PAD.top + INNER_H - (val / maxPrompts) * INNER_H;

  const linePath = dailyPoints
    .map((p, i) => {
      const x = PAD.left + i * step + step / 2;
      const y = lineY(p.prompts);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="widgetPanel" style={{ flex: 1 }}>
      <div className="widgetHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 13 }}>
          AI Committed vs Prompts
        </span>
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--line)" }}
        >
          <option value="team">Team</option>
          {userOptions.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          style={{ width: "100%", height: "auto", overflow: "visible" }}
          role="img"
          aria-label="AI Committed Lines vs Prompts chart"
        >
          {/* Y-axis left label */}
          <text x={4} y={PAD.top + INNER_H / 2} fontSize={9} fill="var(--muted)" textAnchor="middle"
            transform={`rotate(-90, 4, ${PAD.top + INNER_H / 2})`}>
            Lines
          </text>
          {/* Y-axis right label */}
          <text x={CHART_W - 4} y={PAD.top + INNER_H / 2} fontSize={9} fill="var(--coditas-turquoise, #11CAE6)"
            textAnchor="middle" transform={`rotate(90, ${CHART_W - 4}, ${PAD.top + INNER_H / 2})`}>
            Prompts
          </text>

          {/* Bars — accepted lines */}
          {dailyPoints.map((p, i) => {
            const h = barH(p.acceptedLines);
            const x = barX(i);
            const y = PAD.top + INNER_H - h;
            return (
              <rect
                key={p.date}
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                fill="var(--coditas-violet, #9900E6)"
                fillOpacity={0.75}
                rx={1}
                onMouseEnter={(e) => {
                  const svgRect = (e.currentTarget.closest("svg") as SVGSVGElement).getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top - 12,
                    label: `${p.date}: ${p.acceptedLines} lines · ${p.prompts} prompts`
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "default" }}
              />
            );
          })}

          {/* Line — prompts */}
          {dailyPoints.length > 1 && (
            <>
              <path
                d={linePath}
                fill="none"
                stroke="var(--coditas-turquoise, #11CAE6)"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              {dailyPoints.map((p, i) => (
                <circle
                  key={`dot-${p.date}`}
                  cx={PAD.left + i * step + step / 2}
                  cy={lineY(p.prompts)}
                  r={2.5}
                  fill="var(--coditas-turquoise, #11CAE6)"
                />
              ))}
            </>
          )}

          {/* X-axis — show first and last date */}
          {dailyPoints.length > 0 && (
            <>
              <text x={PAD.left} y={CHART_H - 4} fontSize={8} fill="var(--muted)" textAnchor="start">
                {dailyPoints[0].date.slice(5)}
              </text>
              <text x={CHART_W - PAD.right} y={CHART_H - 4} fontSize={8} fill="var(--muted)" textAnchor="end">
                {dailyPoints[dailyPoints.length - 1].date.slice(5)}
              </text>
            </>
          )}
        </svg>

        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              background: "var(--text)",
              color: "#fff",
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 10,
              transform: "translateX(-50%)"
            }}
          >
            {tooltip.label}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 10, color: "var(--muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "var(--coditas-violet, #9900E6)", display: "inline-block", borderRadius: 2 }} />
          Accepted Lines
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 2, background: "var(--coditas-turquoise, #11CAE6)", display: "inline-block" }} />
          Prompts
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/widgets/AICommittedChart.tsx
git commit -m "feat: AICommittedChart — dual-axis SVG (accepted lines + prompts)"
```

---

## Task 9: QuotaChart component

**Files:**
- Create: `components/widgets/QuotaChart.tsx`

- [ ] **Step 1: Create `components/widgets/QuotaChart.tsx`**

```tsx
import { useMemo, useState } from "react";
import type { DailyUsageRow } from "@/lib/cursor-admin";
import type { TimeWindow } from "@/lib/metrics";

interface QuotaChartProps {
  dailyRows: DailyUsageRow[];
  window: TimeWindow;
  quotaCap: number;
  onQuotaCapChange: (cap: number) => void;
  billingCycleResetDate?: string; // ISO date string e.g. "2026-04-27"
}

const CHART_H = 120;
const CHART_W = 300;
const PAD = { top: 8, right: 8, bottom: 24, left: 36 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

const ANOMALY_THRESHOLD = 0.30; // 30% of monthly cap in one day

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function QuotaChart({ dailyRows, window, quotaCap, onQuotaCapChange, billingCycleResetDate }: QuotaChartProps) {
  const [editingCap, setEditingCap] = useState(false);
  const [capInput, setCapInput] = useState(String(quotaCap));
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  // Aggregate subscriptionIncludedReqs per day across all users
  const dailyPoints = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyRows) {
      if (!row.email) continue;
      const dateStr = new Date(row.date).toISOString().slice(0, 10);
      const existing = map.get(dateStr) ?? 0;
      map.set(dateStr, existing + (row.subscriptionIncludedReqs ?? 0));
    }
    // Fill all days in window (including 0-usage days)
    const oneDayMs = 24 * 60 * 60 * 1000;
    const points: Array<{ date: string; used: number; weekend: boolean; anomaly: boolean }> = [];
    let cur = window.startDate;
    while (cur < window.endDate) {
      const dateStr = new Date(cur).toISOString().slice(0, 10);
      const used = map.get(dateStr) ?? 0;
      points.push({
        date: dateStr,
        used,
        weekend: isWeekend(dateStr),
        anomaly: used > quotaCap * ANOMALY_THRESHOLD
      });
      cur += oneDayMs;
    }
    return points;
  }, [dailyRows, window, quotaCap]);

  const maxVal = Math.max(...dailyPoints.map((p) => p.used), quotaCap, 1);
  const n = dailyPoints.length || 1;
  const step = INNER_W / n;
  const barW = Math.max(2, step * 0.7);

  const toY = (val: number) => PAD.top + INNER_H - (val / maxVal) * INNER_H;
  const barX = (i: number) => PAD.left + i * step + step / 2 - barW / 2;

  const quotaLineY = toY(quotaCap);

  function barColor(p: { weekend: boolean; anomaly: boolean }): string {
    if (p.anomaly) return "var(--coditas-red, #FF174F)";
    if (p.weekend) return "var(--line, #EBE9EF)";
    return "var(--coditas-violet, #9900E6)";
  }

  function handleCapSave() {
    const parsed = parseInt(capInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onQuotaCapChange(parsed);
    }
    setEditingCap(false);
  }

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00Z");
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  };

  return (
    <div className="widgetPanel" style={{ flex: 1 }}>
      <div className="widgetHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 13 }}>
          Quota Usage
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
          <span style={{ color: "var(--muted)" }}>Cap:</span>
          {editingCap ? (
            <input
              autoFocus
              type="number"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              onBlur={handleCapSave}
              onKeyDown={(e) => { if (e.key === "Enter") handleCapSave(); if (e.key === "Escape") setEditingCap(false); }}
              style={{ width: 56, fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--coditas-violet, #9900E6)" }}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setCapInput(String(quotaCap)); setEditingCap(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--coditas-violet, #9900E6)", fontWeight: 600, padding: 0 }}
            >
              {quotaCap} ✎
            </button>
          )}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          style={{ width: "100%", height: "auto", overflow: "visible" }}
          role="img"
          aria-label="Quota usage chart"
        >
          {/* Quota cap line */}
          <line
            x1={PAD.left}
            y1={quotaLineY}
            x2={CHART_W - PAD.right}
            y2={quotaLineY}
            stroke="var(--coditas-red, #FF174F)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text x={CHART_W - PAD.right + 2} y={quotaLineY + 3} fontSize={8} fill="var(--coditas-red, #FF174F)">
            Cap
          </text>

          {/* Bars */}
          {dailyPoints.map((p, i) => {
            const h = Math.max((p.used / maxVal) * INNER_H, 1);
            const x = barX(i);
            const y = PAD.top + INNER_H - h;
            return (
              <rect
                key={p.date}
                x={x}
                y={y}
                width={barW}
                height={h}
                fill={barColor(p)}
                fillOpacity={p.weekend ? 0.6 : 0.85}
                rx={1}
                onMouseEnter={(e) => {
                  const svgRect = (e.currentTarget.closest("svg") as SVGSVGElement).getBoundingClientRect();
                  const pct = quotaCap > 0 ? ((p.used / quotaCap) * 100).toFixed(0) : 0;
                  const label = `${p.date} (${dayLabel(p.date)}): ${p.used} reqs · ${pct}% of cap${p.anomaly ? " ⚠ anomaly" : ""}`;
                  setTooltip({ x: e.clientX - svgRect.left, y: e.clientY - svgRect.top - 12, label });
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "default" }}
              />
            );
          })}

          {/* X-axis first/last dates */}
          {dailyPoints.length > 0 && (
            <>
              <text x={PAD.left} y={CHART_H - 4} fontSize={8} fill="var(--muted)" textAnchor="start">
                {dailyPoints[0].date.slice(5)}
              </text>
              <text x={CHART_W - PAD.right} y={CHART_H - 4} fontSize={8} fill="var(--muted)" textAnchor="end">
                {dailyPoints[dailyPoints.length - 1].date.slice(5)}
              </text>
            </>
          )}
        </svg>

        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              background: "var(--text)",
              color: "#fff",
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 10,
              transform: "translateX(-50%)"
            }}
          >
            {tooltip.label}
          </div>
        )}
      </div>

      {/* Legend + reset date */}
      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 10, color: "var(--muted)", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "var(--coditas-violet, #9900E6)", display: "inline-block", borderRadius: 2 }} />
          Weekday
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "var(--line, #EBE9EF)", border: "1px solid #ccc", display: "inline-block", borderRadius: 2 }} />
          Weekend
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "var(--coditas-red, #FF174F)", display: "inline-block", borderRadius: 2 }} />
          Anomaly (&gt;30%)
        </span>
        {billingCycleResetDate && (
          <span style={{ marginLeft: "auto" }}>Resets {billingCycleResetDate}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/widgets/QuotaChart.tsx
git commit -m "feat: QuotaChart — weekday/weekend bars with quota cap and anomaly detection"
```

---

## Task 10: OverallScorePill component

**Files:**
- Create: `components/widgets/OverallScorePill.tsx`

- [ ] **Step 1: Create `components/widgets/OverallScorePill.tsx`**

```tsx
import { useState } from "react";
import type { UserWindowMetricRow } from "@/lib/metrics";

interface OverallScorePillProps {
  row: UserWindowMetricRow;
  teamMaxUsage: number;
}

type ScoreTier = { label: string; bg: string; text: string };

function getTier(score: number): ScoreTier {
  if (score >= 75) return { label: "Excellent", bg: "#9900E6", text: "#fff" };
  if (score >= 50) return { label: "Good", bg: "#11CAE6", text: "#fff" };
  if (score >= 25) return { label: "Fair", bg: "#FF8C42", text: "#fff" };
  return { label: "Low", bg: "#736A85", text: "#fff" };
}

export function OverallScorePill({ row, teamMaxUsage }: OverallScorePillProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tier = getTier(row.overallScore);

  const adoptionPts = (row.adoptionRate * 0.30 * 100).toFixed(1);
  const tabPts = (row.tabEfficiency * 0.20 * 100).toFixed(1);
  const agentPts = (row.agentEfficiency * 0.20 * 100).toFixed(1);
  const prodNorm = Math.min(row.productivityScore / 100, 1);
  const prodPts = (prodNorm * 0.20 * 100).toFixed(1);
  const usageNorm = teamMaxUsage > 0 ? row.usageCount / teamMaxUsage : 0;
  const usagePts = (usageNorm * 0.10 * 100).toFixed(1);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: tier.bg,
          color: tier.text,
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          cursor: "default",
          userSelect: "none"
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {row.overallScore.toFixed(1)}
        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{tier.label}</span>
      </div>

      {showTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#171717",
            color: "#fff",
            fontSize: 11,
            padding: "8px 10px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            zIndex: 20,
            lineHeight: 1.6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: tier.bg }}>Score Breakdown</div>
          <div>Adoption    30% → {adoptionPts} pts</div>
          <div>Tab Eff.    20% → {tabPts} pts</div>
          <div>Agent Eff.  20% → {agentPts} pts</div>
          <div>Productivity 20% → {prodPts} pts</div>
          <div>Usage       10% → {usagePts} pts</div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
            Total: {row.overallScore.toFixed(1)} / 100 — {tier.label}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/widgets/OverallScorePill.tsx
git commit -m "feat: OverallScorePill with hover breakdown tooltip"
```

---

## Task 11: MetricDefinitionsPanel component

**Files:**
- Create: `components/widgets/MetricDefinitionsPanel.tsx`

- [ ] **Step 1: Create `components/widgets/MetricDefinitionsPanel.tsx`**

```tsx
import { useState } from "react";
import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";

export function MetricDefinitionsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          color: "var(--coditas-violet, #9900E6)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: 0
        }}
      >
        {open ? "▴" : "▾"} {open ? "Hide" : "Show"} metric definitions
      </button>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {METRIC_DEFINITIONS.map((def) => (
            <div
              key={def.name}
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "12px 16px"
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 14 }}>
                  {def.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#fff",
                    background: "var(--coditas-violet, #9900E6)",
                    padding: "1px 7px",
                    borderRadius: 999,
                    fontWeight: 500
                  }}
                >
                  {def.unit}
                </span>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text)" }}>{def.tagline}</p>
              <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 }}>
                <div><strong>Formula:</strong> {def.formula}</div>
                <div><strong>Source:</strong> {def.source}</div>
                <div><strong>Interpret:</strong> {def.interpret}</div>
                {def.warning && (
                  <div
                    style={{
                      marginTop: 4,
                      background: "rgba(255,23,79,0.06)",
                      border: "1px solid rgba(255,23,79,0.2)",
                      borderRadius: 4,
                      padding: "4px 8px",
                      color: "var(--coditas-red, #FF174F)"
                    }}
                  >
                    ⚠️ {def.warning}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/widgets/MetricDefinitionsPanel.tsx
git commit -m "feat: MetricDefinitionsPanel — expandable glossary with units and warnings"
```

---

## Task 12: Wire everything into dashboard.tsx

**Files:**
- Modify: `components/dashboard.tsx`

- [ ] **Step 1: Add new imports at the top of dashboard.tsx**

After the existing widget imports, add:

```ts
import { AICommittedChart } from "@/components/widgets/AICommittedChart";
import { QuotaChart } from "@/components/widgets/QuotaChart";
import { MetricDefinitionsPanel } from "@/components/widgets/MetricDefinitionsPanel";
import { OverallScorePill } from "@/components/widgets/OverallScorePill";
import type { DailyUsageRow } from "@/lib/cursor-admin";
```

- [ ] **Step 2: Add quota cap and daily rows state**

In the dashboard component state declarations (near the top of the component function), add:

```ts
const [quotaCap, setQuotaCap] = useState<number>(500);
const [dailyRows, setDailyRows] = useState<DailyUsageRow[]>([]);
const [billingCycleResetDate, setBillingCycleResetDate] = useState<string | undefined>(undefined);
```

- [ ] **Step 3: Load quota cap and daily rows on mount and window change**

Add a `useEffect` that runs when `selectedWindow` changes:

```ts
useEffect(() => {
  // Load quota cap from settings
  fetch("/api/settings?key=quota_cap")
    .then((r) => r.json())
    .then((data: { value: string }) => {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed)) setQuotaCap(parsed);
    })
    .catch(() => {/* keep default 500 */});

  // Load daily usage rows for quota chart
  fetch(`/api/daily-usage?window=${selectedWindow.id}`)
    .then((r) => r.json())
    .then((data: { rows: DailyUsageRow[] }) => {
      if (data.rows) setDailyRows(data.rows);
    })
    .catch(() => {/* keep empty */});

  // Load billing cycle reset date from spend data
  fetch("/api/spend")
    .then((r) => r.json())
    .then((data: { entries: Array<{ billingCycleStart?: string }> }) => {
      // billingCycleStart is cycle start; add ~30 days for reset estimate
      // For display we just show it as "next cycle" - use the spend API's cycleStart
    })
    .catch(() => {});
}, [selectedWindow.id]);
```

- [ ] **Step 4: Save quota cap to DB when changed**

Add a handler function in the dashboard component:

```ts
async function handleQuotaCapChange(cap: number) {
  setQuotaCap(cap);
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "quota_cap", value: String(cap) })
  });
}
```

- [ ] **Step 5: Replace PlaceholderPanel components with real charts**

Find lines 956–957 in `dashboard.tsx`:
```tsx
<PlaceholderPanel title="Work Type" />
<PlaceholderPanel title="Categories" />
```

Replace with:
```tsx
<AICommittedChart
  rows={visibleRows}
  window={selectedWindow}
/>
<QuotaChart
  dailyRows={dailyRows}
  window={selectedWindow}
  quotaCap={quotaCap}
  onQuotaCapChange={handleQuotaCapChange}
  billingCycleResetDate={billingCycleResetDate}
/>
```

(`visibleRows` is whatever the current filtered/grouped rows array is called in the dashboard — check the variable name near line 956.)

- [ ] **Step 6: Add Overall Score column to analytics table**

Find the table header row in `dashboard.tsx`. Add a new `<th>` for Overall Score — place it as the first data column (before Usage, after Name):

```tsx
<th
  style={{ cursor: "pointer", userSelect: "none" }}
  onClick={() => handleSort("overallScore")}
>
  Score {sortKey === "overallScore" ? (sortDir === "asc" ? "↑" : "↓") : ""}
</th>
```

Find the table data rows. Add the `<td>` for Overall Score:

```tsx
<td>
  <OverallScorePill
    row={row}
    teamMaxUsage={Math.max(...visibleRows.map((r) => r.usageCount), 1)}
  />
</td>
```

- [ ] **Step 7: Add MetricDefinitionsPanel below analytics table**

Find the closing tag of the analytics table section. Directly after it, add:

```tsx
<MetricDefinitionsPanel />
```

- [ ] **Step 8: Add subscriptionIncludedReqs section in user usage events drawer**

Find the section in `dashboard.tsx` where usage events are rendered for a selected user (the drawer/modal). After the events list, add:

```tsx
{selectedUserEmail && (
  <UserQuotaSection
    email={selectedUserEmail}
    windowId={selectedWindow.id}
    quotaCap={quotaCap}
  />
)}
```

Create this inline component just above the dashboard component function:

```tsx
function UserQuotaSection({
  email,
  windowId,
  quotaCap
}: {
  email: string;
  windowId: string;
  quotaCap: number;
}) {
  const [rows, setRows] = useState<DailyUsageRow[]>([]);

  useEffect(() => {
    fetch(`/api/daily-usage?window=${windowId}&email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((data: { rows: DailyUsageRow[] }) => { if (data.rows) setRows(data.rows); })
      .catch(() => {});
  }, [email, windowId]);

  const total = rows.reduce((sum, r) => sum + (r.subscriptionIncludedReqs ?? 0), 0);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 13, marginBottom: 8 }}>
        Quota Usage
      </h3>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--muted)", textAlign: "left" }}>
            <th style={{ padding: "4px 8px", borderBottom: "1px solid var(--line)" }}>Date</th>
            <th style={{ padding: "4px 8px", borderBottom: "1px solid var(--line)" }}>Day</th>
            <th style={{ padding: "4px 8px", borderBottom: "1px solid var(--line)" }}>Included Reqs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dateStr = new Date(r.date).toISOString().slice(0, 10);
            const d = new Date(dateStr + "T00:00:00Z");
            const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
            const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
            const used = r.subscriptionIncludedReqs ?? 0;
            const anomaly = used > quotaCap * 0.30;
            return (
              <tr key={dateStr} style={{ color: anomaly ? "var(--coditas-red, #FF174F)" : weekend ? "var(--muted)" : "var(--text)" }}>
                <td style={{ padding: "3px 8px" }}>{dateStr}</td>
                <td style={{ padding: "3px 8px" }}>{weekend ? `✗ ${dayName}` : `✓ ${dayName}`}</td>
                <td style={{ padding: "3px 8px" }}>
                  {used}
                  {anomaly && " ⚠"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        Total: <strong>{total}</strong> / {quotaCap} included requests
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. Fix any variable name mismatches (e.g., the exact name of `visibleRows` or `selectedUserEmail` in `dashboard.tsx`).

- [ ] **Step 10: Verify end-to-end in browser**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- `Work Type` slot shows the AI Committed vs Prompts chart with bars and line
- `Categories` slot shows Quota chart with colored bars and dashed red cap line
- Analytics table has `Score` column with colored pills
- Hover on a pill shows the breakdown tooltip
- "Show metric definitions ▾" toggle reveals all 9 definitions at bottom of table
- Clicking a user row shows Quota Usage section in the drawer

- [ ] **Step 11: Commit**

```bash
git add components/dashboard.tsx
git commit -m "feat: wire AICommittedChart, QuotaChart, OverallScorePill, MetricDefinitionsPanel into dashboard"
```

---

## Task 13: Final verification

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: build completes with no errors or warnings about missing types.

- [ ] **Step 3: Visual checklist**

Open `http://localhost:3000` and verify:
- [ ] Coditas gradient logo in sidebar
- [ ] Page title has violet→turquoise gradient
- [ ] Active window chip is `#9900E6` violet
- [ ] Table header has subtle violet tint
- [ ] `Work Type` panel shows dual-axis chart (bars + line), team/individual toggle works
- [ ] `Categories` panel shows bar chart with red cap line, cap is editable inline
- [ ] Weekend bars are grey, weekday bars are violet, anomaly bars are red
- [ ] Analytics table has `Score` column as first data column, sorted descending by default
- [ ] Score pills have correct colors: violet ≥75, turquoise ≥50, amber ≥25, grey <25
- [ ] Hover on pill shows 5-component breakdown
- [ ] "Show metric definitions" toggle reveals 9 cards with unit badges
- [ ] Quota Utilisation definition shows the ⚠️ warning about non-billable units
- [ ] Clicking a user → usage events drawer → Quota Usage section shows per-day table
- [ ] Quota cap edit: click pencil, type new value, press Enter → persists after refresh (DB round-trip)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Plan 2 complete — Coditas theme, charts, overall score, metric definitions"
```
