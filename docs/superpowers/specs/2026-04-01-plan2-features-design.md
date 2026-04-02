# Design: Coditas Theme + Charts + Overall Score + Metric Definitions
**Date:** 2026-04-01
**Depends on:** Plan 1 (DB + Sync Layer) must be fully executed first.

---

## Overview

Five features added on top of the Plan 1 foundation:

1. **Coditas Theme** — brand colors, typography, logo across all UI
2. **AI Committed vs Prompts Chart** — replaces `Work Type` placeholder panel
3. **Quota Chart** — replaces `Categories` placeholder panel, quota cap stored in DB
4. **Overall Score** — new computed column in analytics table
5. **Metric Definitions Panel** — expandable glossary with units, formulas, sources

---

## Architecture

All chart data comes from `UserWindowMetricRow[]` already fetched by the existing `/api/team-metrics` route (Plan 1). No new Cursor API calls for charts. A new `team_settings` table stores admin-configurable values (quota cap). A new `/api/daily-usage` route serves per-user daily rows for the usage events drawer.

---

## Schema Addition (one migration on top of Plan 1)

### `team_settings`
```
key         text PRIMARY KEY   -- 'quota_cap', future settings
value       text NOT NULL      -- stored as string, parsed by consumer
updated_at  timestamptz NOT NULL DEFAULT now()
```

Initial seed: `{ key: 'quota_cap', value: '500' }`.

---

## Feature 1: Coditas Theme

Applied via CSS variables in the global stylesheet. Font imports added to `app/layout.tsx`.

### CSS Variables
```css
:root {
  --coditas-violet: #9900E6;
  --coditas-turquoise: #11CAE6;
  --coditas-red: #FF174F;
  --coditas-purple: #5B0FFE;
  --coditas-text: #171717;
  --coditas-grey-1: #736A85;
  --coditas-grey-2: #EBE9EF;
  --coditas-grey-3: #f5f5f5;
  --coditas-gradient: linear-gradient(135deg, #9900E6, #11CAE6);
  --coditas-gradient-alt: linear-gradient(135deg, #9900E6, #FF174F);
  --font-heading: 'Urbanist', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

### Applied To
| Element | Treatment |
|---------|-----------|
| Page/dashboard header | `--coditas-gradient` background, white text, Urbanist font |
| Coditas logo | `gradient.png` top-left, `height: 32px` |
| Active tab underline | `--coditas-violet` |
| QuartileBarChart bars | Violet fill with turquoise for selected state |
| Sparklines | `--coditas-turquoise` stroke |
| Table header row | Light violet tint (`#9900E6` at 5% opacity) |
| Borders / dividers | `--coditas-grey-2` |
| Page background | `--coditas-grey-3` |
| Pill badges (score) | Color-coded per tier (see Overall Score) |
| Body text | `--coditas-text`, Inter font |
| Headings / labels | Urbanist font |

### Fonts
```html
<!-- In app/layout.tsx <head> -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Urbanist:wght@600;700;800&display=swap" rel="stylesheet">
```

---

## Feature 2: AI Committed vs Prompts Chart

**Slot:** Replaces `<PlaceholderPanel title="Work Type" />` at `dashboard.tsx:956`
**Component:** `components/widgets/AICommittedChart.tsx`

### Props
```ts
interface AICommittedChartProps {
  rows: UserWindowMetricRow[];       // all visible users
  window: TimeWindow;                // selected time window
  selectedUserEmail?: string | null; // null = team view
}
```

### Data Computed Inside Component
Per day in `window`:
```ts
acceptedLines = sum over users of (acceptedLinesAdded + acceptedLinesDeleted)  // from dailyTrend
prompts       = sum over users of (agentRequests + composerRequests + chatRequests + cmdkUsages)
```

For individual view: filter `rows` to `selectedUserEmail` before aggregating.

### Chart Anatomy (pure SVG)
```
Title: "AI Committed vs Prompts"
Toggle: [Team ▾] dropdown (all users) | Individual (user email picker)

Dual-axis SVG:
  Left Y-axis  : Accepted Lines (integer)
  Right Y-axis : Total Prompts (integer)
  X-axis       : Days in selected window
  Bars         : Accepted lines per day — fill: --coditas-violet
  Line         : Prompts per day — stroke: --coditas-turquoise, 2px
  Dots         : On each line point, radius 3
  Tooltip      : On hover → "Mar 15: 240 accepted lines, 18 prompts"
```

### DailyTrendPoint Extension
`lib/metrics.ts` `DailyTrendPoint` gets two new fields:
```ts
interface DailyTrendPoint {
  date: string;
  usageCount: number;
  isActive: boolean;
  acceptedLines: number;   // NEW: acceptedLinesAdded + acceptedLinesDeleted for that day
  prompts: number;         // NEW: agent + composer + chat + cmdk for that day
}
```
Populated in `buildUserWindowMetrics()` from existing `dailyUsageData`.

### Metric Definition
| Field | Value |
|-------|-------|
| Name | AI Code Acceptance |
| Unit | accepted lines / day, prompts / day |
| Formula | Bars: `acceptedLinesAdded + acceptedLinesDeleted` per day. Line: `agentRequests + composerRequests + chatRequests + cmdkUsages` per day |
| Source | `/teams/daily-usage-data` — `acceptedLinesAdded`, `acceptedLinesDeleted`, `agentRequests`, `composerRequests`, `chatRequests`, `cmdkUsages` |
| Interpret | High bars with low line = AI output is high-quality and accepted efficiently. High line with low bars = many prompts but little accepted code — signals friction or exploratory usage. |

---

## Feature 3: Quota Chart

**Slot:** Replaces `<PlaceholderPanel title="Categories" />` at `dashboard.tsx:957`
**Component:** `components/widgets/QuotaChart.tsx`

### Props
```ts
interface QuotaChartProps {
  dailyUsageRows: DailyUsageRow[];  // from daily_usage_rows table via /api/daily-usage
  window: TimeWindow;
  quotaCap: number;                 // from team_settings, default 500
  onQuotaCapChange: (cap: number) => void;
}
```

### Quota Cap Storage
- Stored in `team_settings` table, key = `'quota_cap'`
- Loaded via `GET /api/settings?key=quota_cap` on dashboard mount
- Updated via `POST /api/settings` when admin edits inline input
- Inline editable: small number input in chart header, saves on blur

### Data Computed Inside Component
Per day in `window`:
```ts
dailyUsed = sum of subscriptionIncludedReqs across all users for that day
isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6
isAnomaly = dailyUsed > quotaCap * 0.30
```

### Chart Anatomy (pure SVG)
```
Title: "Quota Usage"
Header right: [Quota cap: [500] ✎] inline editable input

SVG bar chart:
  X-axis  : Days in selected window
  Y-axis  : Requests used (0 → quotaCap)
  Bars    : --coditas-violet on weekdays
            --coditas-grey-2 on weekends
            --coditas-red on anomaly days (> 30% of cap in one day)
  Line    : Dashed --coditas-red horizontal at quotaCap value
  Label   : "Resets [date]" below chart (from billingCycleStart in team_members sync)
  Tooltip : "Mar 15 (Mon): 47 requests used" or "Mar 16 (Sat): 2 requests — weekend"
```

### Anomaly Definition
A day is flagged as anomalous when `subscriptionIncludedReqs` (team total) exceeds 30% of the configured monthly quota cap in a single day. This surfaces outlier spikes — e.g. a burst of usage over a weekend.

### New API Routes
- `GET /api/settings?key=quota_cap` → `{ key, value, updatedAt }`
- `POST /api/settings` body `{ key, value }` → upsert into `team_settings`
- `GET /api/daily-usage?window=<id>&email=<optional>` → `DailyUsageRow[]` from DB

### Metric Definition
| Field | Value |
|-------|-------|
| Name | Quota Utilisation |
| Unit | requests / day |
| Formula | Sum of `subscriptionIncludedReqs` across all team members per calendar day |
| Source | `/teams/daily-usage-data` — `subscriptionIncludedReqs` field |
| Interpret | Weekday bars (violet) show normal working usage. Weekend bars (grey) should be low — spikes on weekends or a single day exceeding 30% of monthly quota (red) are anomalies worth investigating. |
| ⚠️ Warning | `subscriptionIncludedReqs` counts raw usage events, not billable request units. Do not use for cost calculations. For billing-accurate data, use `/teams/filtered-usage-events` and sum `chargedCents`. |

---

## Feature 4: `subscriptionIncludedReqs` in User Usage Events Drawer

When admin clicks a user row and the usage events drawer opens, a **"Quota Usage"** sub-section is added below the events list.

**Data source:** `GET /api/daily-usage?window=<id>&email=<user>` — queries `daily_usage_rows` in DB directly. No Cursor API call.

**Rendered as:**
```
Quota Usage — [window label]
Date         Weekday?   Included Requests
2026-03-01   ✓ Mon      12
2026-03-02   ✗ Sun      0
2026-03-03   ✓ Tue      34  ⚠ anomaly
─────────────────────────────────────────
Total: 46 / 500 included requests
```

Anomaly threshold same as Quota Chart: `> quotaCap * 0.30` per day per user.

---

## Feature 5: Overall Score

### Formula
```
overallScore = (
  adoptionRate               * 0.30 +
  tabEfficiency              * 0.20 +
  agentEfficiency            * 0.20 +
  min(productivityScore/100) * 0.20 +   ← capped at 1.0
  usageNorm                  * 0.10     ← usageCount / max(usageCount across team)
) * 100
```
Result: `0–100`, rounded to 1 decimal.

### Computed In
`lib/metrics.ts` — `buildUserWindowMetrics()`. New field `overallScore: number` added to `UserWindowMetricRow`. Requires a second pass after all rows are built (to compute `usageNorm` relative to team max).

### Rendered In Analytics Table
| Score Range | Pill Color | Label |
|-------------|------------|-------|
| 75–100 | Violet `#9900E6` | Excellent |
| 50–74 | Turquoise `#11CAE6` | Good |
| 25–49 | `#FF8C42` (amber) | Fair |
| 0–24 | Grey `#736A85` | Low |

Hover tooltip shows 5-component breakdown:
```
Adoption:      30% weight → 0.82 × 30 = 24.6
Tab Eff:       20% weight → 0.15 × 20 =  3.0
Agent Eff:     20% weight → 0.67 × 20 = 13.4
Productivity:  20% weight → 0.45 × 20 =  9.0
Usage:         10% weight → 0.90 × 10 =  9.0
────────────────────────────────────────
Overall Score: 59.0 / 100  →  Good
```

Default sort: analytics table sorts by `overallScore` descending.

### Metric Definition
| Field | Value |
|-------|-------|
| Name | Overall Score |
| Unit | score 0–100 |
| Formula | `(adoptionRate×0.30 + tabEfficiency×0.20 + agentEfficiency×0.20 + min(productivityScore/100,1)×0.20 + usageNorm×0.10) × 100` |
| Source | All fields from `/teams/daily-usage-data` via computed metrics |
| Interpret | A balanced signal of AI engagement quality. 75+ = consistent, high-quality AI usage. 50–74 = solid adopter with room to improve. 25–49 = occasional or low-quality usage. Below 25 = minimal AI integration. |

---

## Feature 6: Metric Definitions Panel

**Location:** Below the analytics table, above the footer. Single toggle button: `Show metric definitions ▾ / ▴`.

**Each entry:**
```
┌─ [Metric Name]  ·  unit: [unit] ────────────────────────────────┐
│ Tagline: one sentence plain-English description                   │
│ Formula: exact calculation                                        │
│ Source:  Cursor API field(s)                                      │
│ Interpret: what high/low values mean                              │
│ ⚠️ Warning (if applicable)                                        │
└──────────────────────────────────────────────────────────────────┘
```

**All 9 definitions covered:**

| # | Metric | Unit |
|---|--------|------|
| 1 | Usage | requests |
| 2 | Productivity Score | lines / request |
| 3 | Agent Efficiency | % |
| 4 | Tab Efficiency | % |
| 5 | Adoption Rate | % |
| 6 | Favorite Model | model name |
| 7 | Overall Score *(new)* | score 0–100 |
| 8 | AI Code Acceptance *(new)* | lines / day, prompts / day |
| 9 | Quota Utilisation *(new)* | requests / day |

Definitions data moves from `route.ts` hardcoded object → `lib/metric-definitions.ts` shared module. Both the API response and the UI panel import from the same source. Single source of truth.

---

## File Map

**Created:**
- `components/widgets/AICommittedChart.tsx`
- `components/widgets/QuotaChart.tsx`
- `components/widgets/MetricDefinitionsPanel.tsx`
- `components/widgets/OverallScoreTooltip.tsx`
- `lib/metric-definitions.ts`
- `lib/db/queries/settings.ts`
- `app/api/settings/route.ts`
- `app/api/daily-usage/route.ts`

**Modified:**
- `lib/db/schema.ts` — add `team_settings` table
- `lib/metrics.ts` — add `overallScore` to `UserWindowMetricRow`, extend `DailyTrendPoint`
- `app/layout.tsx` — add Google Fonts import
- `app/globals.css` (or equivalent) — add CSS variables + Coditas theme
- `components/dashboard.tsx` — replace placeholders, add overall score column, add definitions panel, wire quota cap settings
