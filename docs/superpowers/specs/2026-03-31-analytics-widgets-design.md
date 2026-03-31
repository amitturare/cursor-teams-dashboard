# Analytics Widgets Design

**Date:** 2026-03-31
**Status:** Approved

---

## Overview

Add a widget row above the Team Rollup summary table in the Analytics tab. The row contains 6 panels: 2 fixed placeholder panels (reserved for future charts) and 4 changeable quartile bar chart widgets. Clicking bars in the changeable widgets AND-filters the users shown in both the Team Rollup table and the user list below.

No new API calls are required. All computation is client-side from already-fetched data.

---

## Layout

The widget row is inserted between the **"Team Rollup" heading** and the **Team Rollup summary stats table**.

```
Team Rollup                              [date range · users in view · last updated]

┌─────────────────────────────┐ ┌─────────────────────────────┐
│  Fixed Placeholder A        │ │  Fixed Placeholder B        │
│  (Coming soon)              │ │  (Coming soon)              │
└─────────────────────────────┘ └─────────────────────────────┘

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Widget 1   │ │ Widget 2   │ │ Widget 3   │ │ Widget 4   │
│ [dropdown] │ │ [dropdown] │ │ [dropdown] │ │ [dropdown] │
│  bar chart │ │  bar chart │ │  bar chart │ │  bar chart │
└────────────┘ └────────────┘ └────────────┘ └────────────┘

┌──────────────────────────────────────────────────────────┐
│ Total AI Requests  Avg Productivity  Avg Agent Eff. …    │  ← Team Rollup table
└──────────────────────────────────────────────────────────┘

Filter  [ All Users ▾ ]

┌─ User ─── Group ─── Favorite Model ─── Usage ─── … ─────┐
│  …user rows…                                             │
└──────────────────────────────────────────────────────────┘
```

---

## Fixed Placeholder Panels

- Two panels at 50/50 width in the first row.
- Each shows a title (e.g. "Work Type", "Categories") and a "Coming soon" message.
- Styled with a subtle dashed border to signal they are reserved.
- No interactivity.

---

## Changeable Quartile Bar Chart Widgets

### Number and defaults

4 widgets, each independent. Default metric per slot on first load:

| Slot | Default metric |
|------|---------------|
| 1 | Total AI Requests |
| 2 | Avg Productivity |
| 3 | Avg Agent Eff. |
| 4 | Avg Adoption |

### Metric dropdown

Each widget has a small dropdown at the top. Options:
- Total AI Requests
- Avg Productivity
- Avg Agent Eff.
- Avg Tab Eff.
- Avg Adoption

Changing the metric in a widget clears that widget's selected band.

### Value-range bucketing

Users are split into 4 bands based on their metric value within a fixed or dynamic scale:

| Metric | Scale type | Bands |
|--------|-----------|-------|
| Avg Agent Eff. | Natural 0–100% | Fixed: 0–25%, 25–50%, 50–75%, 75–100% |
| Avg Tab Eff. | Natural 0–100% | Fixed: 0–25%, 25–50%, 50–75%, 75–100% |
| Avg Adoption | Natural 0–100% | Fixed: 0–25%, 25–50%, 50–75%, 75–100% |
| Total AI Requests | Unbounded count | Dynamic: 0–25% of max, 25–50% of max, 50–75% of max, 75–100% of max |
| Avg Productivity | Unbounded score | Dynamic: 0–25% of max, 25–50% of max, 50–75% of max, 75–100% of max |

For dynamic metrics, the max is derived from the currently-filtered user set (`filteredUsers`, before widget AND-filtering) and recomputes whenever the filter changes. If max is 0 (all users have zero for that metric), all users fall into band 0 (bottom band).

Bucketing is computed from `filteredUsers` (users already filtered by the existing group/individual filter, before widget AND-filtering). This ensures the band boundaries displayed in the chart always match the boundaries used in the AND-filter logic. A user with a value of exactly 0 (no usage) still falls into the bottom band.

### Bar chart rendering

- SVG bars, one per band (4 total).
- X-axis labels: `0–25%`, `25–50%`, `50–75%`, `75–100%`.
- Y-axis: user count in that band.
- A selected bar is visually highlighted (filled accent color vs. muted default).
- If no users fall in a band, the bar is rendered at height 0 (still shown as a label).
- If the AND-filter across all widgets produces zero users (e.g. two widgets select conflicting bands for the same metric), the Team Rollup table and user list show an empty state message: "No users match the selected filters."

### Interaction

- **Click unselected bar:** selects that band for this widget.
- **Click selected bar:** deselects it (removes constraint).
- **Clear button (×):** appears in the widget header when a band is selected; clears this widget's selection only.
- Changing the time window clears all 4 widgets' selections.
- Changing the group/individual filter clears all 4 widgets' selections.

---

## AND-Filter Logic

Each widget exposes a `selectedBand: 0 | 1 | 2 | 3 | null` (null = no constraint).

The effective user list shown in both the Team Rollup table and the user rows is:

```
effectiveUsers = filteredUsers.filter(user =>
  widgets.every(widget =>
    widget.selectedBand === null ||
    getBand(user, widget.metric) === widget.selectedBand
  )
)
```

- `filteredUsers` = users already filtered by the existing group/individual filter.
- `getBand(user, metric)` = which of the 4 bands (0–3) the user falls into for that metric.
- The Team Rollup aggregate stats (Total AI Requests, Avg Productivity, etc.) also recompute over `effectiveUsers`.

---

## State Management

All new state lives in `components/dashboard.tsx` alongside existing state:

```ts
type WidgetMetric = "usageCount" | "productivityScore" | "agentEfficiency" | "tabEfficiency" | "adoptionRate";

interface WidgetState {
  metric: WidgetMetric;
  selectedBand: 0 | 1 | 2 | 3 | null;
}

const [widgets, setWidgets] = useState<[WidgetState, WidgetState, WidgetState, WidgetState]>([
  { metric: "usageCount",       selectedBand: null },
  { metric: "productivityScore", selectedBand: null },
  { metric: "agentEfficiency",  selectedBand: null },
  { metric: "adoptionRate",     selectedBand: null },
]);
```

When `windowId` or the group/individual filter changes, all `selectedBand` values reset to `null`.

---

## New Files

### `components/widgets/QuartileBarChart.tsx`

Props:
```ts
interface QuartileBarChartProps {
  users: UserWindowMetricRow[];       // already group-filtered users
  metric: WidgetMetric;
  selectedBand: 0 | 1 | 2 | 3 | null;
  onMetricChange: (m: WidgetMetric) => void;
  onBandClick: (band: 0 | 1 | 2 | 3 | null) => void;
}
```

Responsibilities:
- Render metric dropdown
- Compute 4 band boundaries from props (no side effects)
- Render SVG bar chart
- Call `onBandClick(null)` when clicking a selected bar (deselect)
- Render × clear button when `selectedBand !== null`

### `components/widgets/PlaceholderPanel.tsx`

Props:
```ts
interface PlaceholderPanelProps {
  title: string;
}
```

Responsibilities:
- Render a titled card with dashed border and "Coming soon" text.

---

## Modified Files

### `components/dashboard.tsx`

- Add `widgets` state (4-tuple of `WidgetState`).
- Reset `widgets` selected bands when `windowId` or filter changes.
- Compute `effectiveUsers` from `filteredUsers` + widget AND-filter.
- Pass `effectiveUsers` to the Team Rollup aggregate computation and the user table render.
- Render the widget row (2 placeholders + 4 `QuartileBarChart` instances) between the "Team Rollup" heading and the rollup table.

---

## Out of Scope

- Work Type, Intent Distribution, Task Complexity, Prompt Specificity, Categories charts — not available in the Cursor Admin API; placeholders are reserved for future implementation.
- Persisting widget metric selections across sessions.
- More than 4 changeable widget slots.
