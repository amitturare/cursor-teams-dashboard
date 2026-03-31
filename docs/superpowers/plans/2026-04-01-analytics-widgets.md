# Analytics Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2 fixed placeholder panels and 4 interactive quartile bar chart widgets between the "Team Rollup" heading and the rollup stats table, where clicking bars AND-filters both the rollup stats and the user rows below.

**Architecture:** Pure client-side — no new API calls. A new `effectiveRows` useMemo in `dashboard.tsx` is computed by AND-intersecting all 4 widget band selections against `analyticsRows`. Two new focused component files handle the UI; a utility module handles pure band math. CSS classes are appended to `globals.css` following existing patterns (CSS variables, class-based, monospace font).

**Tech Stack:** React (useState, useMemo), SVG for bar charts, TypeScript, custom CSS with `--bg / --card / --text / --muted / --line` variables.

---

### Task 1: Add CSS classes to globals.css

**Files:**
- Modify: `app/globals.css` (append to end of file)

- [ ] **Step 1: Append widget CSS**

Open `app/globals.css` and add at the very end:

```css
/* ── Analytics Widgets ── */

.widgetSection {
  margin: 0 0 14px;
}

.widgetRowFixed {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.widgetRowChangeable {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.widgetPanel {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--card);
  padding: 12px 14px;
  min-height: 140px;
  display: flex;
  flex-direction: column;
}

.widgetPanelPlaceholder {
  border-style: dashed;
  background: #fafaf6;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  gap: 6px;
}

.widgetPanelTitle {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.widgetComingSoon {
  font-size: 12px;
  color: var(--muted);
  opacity: 0.6;
}

.widgetHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 6px;
}

.widgetMetricSelect {
  border: 1px solid var(--line);
  background: #fafaf6;
  border-radius: 6px;
  padding: 3px 6px;
  font: inherit;
  font-size: 11px;
  color: var(--text);
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.widgetClearBtn {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 100ms ease, background 100ms ease;
}

.widgetClearBtn:hover {
  color: var(--text);
  background: #eeeee6;
}

.widgetChart {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 80px;
}

.widgetChartSvg {
  flex: 1;
  display: block;
  width: 100%;
  overflow: visible;
}

.widgetBarLabels {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
}

.widgetBarLabel {
  font-size: 10px;
  color: var(--muted);
  text-align: center;
  cursor: pointer;
  transition: color 100ms ease;
  user-select: none;
}

.widgetBarLabelSelected {
  color: var(--text);
  font-weight: 600;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: exits 0 (CSS doesn't affect typecheck but confirms no accidental file corruption)

---

### Task 2: Create PlaceholderPanel component

**Files:**
- Create: `components/widgets/PlaceholderPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
interface PlaceholderPanelProps {
  title: string;
}

export function PlaceholderPanel({ title }: PlaceholderPanelProps) {
  return (
    <div className="widgetPanel widgetPanelPlaceholder">
      <span className="widgetPanelTitle">{title}</span>
      <span className="widgetComingSoon">Coming soon</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 with no errors

---

### Task 3: Create quartile-utils.ts

**Files:**
- Create: `components/widgets/quartile-utils.ts`

- [ ] **Step 1: Create the utility module**

```ts
import type { UserWindowMetricRow } from "@/lib/metrics";

export type WidgetMetric =
  | "usageCount"
  | "productivityScore"
  | "agentEfficiency"
  | "tabEfficiency"
  | "adoptionRate";

export const METRIC_LABELS: Record<WidgetMetric, string> = {
  usageCount: "Total AI Requests",
  productivityScore: "Avg Productivity",
  agentEfficiency: "Avg Agent Eff.",
  tabEfficiency: "Avg Tab Eff.",
  adoptionRate: "Avg Adoption",
};

export const METRIC_OPTIONS: WidgetMetric[] = [
  "usageCount",
  "productivityScore",
  "agentEfficiency",
  "tabEfficiency",
  "adoptionRate",
];

/** Metrics that use a natural 0–1 scale; band boundaries are fixed (0, 0.25, 0.5, 0.75, 1). */
const NATURAL_SCALE_METRICS = new Set<WidgetMetric>([
  "agentEfficiency",
  "tabEfficiency",
  "adoptionRate",
]);

/**
 * Returns the maximum value for dynamic-scale metrics across the user list.
 * For natural-scale metrics always returns 1 (the scale is fixed 0–1).
 */
export function getMetricMax(users: UserWindowMetricRow[], metric: WidgetMetric): number {
  if (NATURAL_SCALE_METRICS.has(metric)) return 1;
  let max = 0;
  for (const u of users) {
    if (u[metric] > max) max = u[metric];
  }
  return max;
}

/**
 * Returns which band (0–3) a value falls into.
 * - Natural-scale metrics: bands at 0–0.25, 0.25–0.5, 0.5–0.75, 0.75–1.0.
 * - Dynamic-scale metrics: 0–25%, 25–50%, 50–75%, 75–100% of max.
 * - If max is 0, all values fall into band 0.
 */
export function getBand(value: number, metric: WidgetMetric, max: number): 0 | 1 | 2 | 3 {
  if (max === 0) return 0;
  // For natural-scale metrics, clamp to [0,1] so band labels remain accurate
  // even if upstream values exceed 1.0 (e.g. agentEfficiency can be > 1).
  const raw = NATURAL_SCALE_METRICS.has(metric) ? value : value / max;
  const ratio = Math.min(raw, 1);
  if (ratio < 0.25) return 0;
  if (ratio < 0.5) return 1;
  if (ratio < 0.75) return 2;
  return 3;
}

export const BAND_LABELS = ["0–25%", "25–50%", "50–75%", "75–100%"] as const;

/** Returns count of users in each band [band0, band1, band2, band3]. */
export function computeBandCounts(
  users: UserWindowMetricRow[],
  metric: WidgetMetric,
  max: number
): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const u of users) {
    counts[getBand(u[metric], metric, max)] += 1;
  }
  return counts;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 with no errors

---

### Task 4: Create QuartileBarChart component

**Files:**
- Create: `components/widgets/QuartileBarChart.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useMemo } from "react";
import type { UserWindowMetricRow } from "@/lib/metrics";
import {
  type WidgetMetric,
  METRIC_LABELS,
  METRIC_OPTIONS,
  BAND_LABELS,
  getMetricMax,
  computeBandCounts,
} from "./quartile-utils";

interface QuartileBarChartProps {
  users: UserWindowMetricRow[];
  metric: WidgetMetric;
  selectedBand: 0 | 1 | 2 | 3 | null;
  onMetricChange: (m: WidgetMetric) => void;
  onBandClick: (band: 0 | 1 | 2 | 3 | null) => void;
}

const CHART_HEIGHT = 80;
const BAR_GAP = 6;

export function QuartileBarChart({
  users,
  metric,
  selectedBand,
  onMetricChange,
  onBandClick,
}: QuartileBarChartProps) {
  const max = useMemo(() => getMetricMax(users, metric), [users, metric]);
  const counts = useMemo(() => computeBandCounts(users, metric, max), [users, metric, max]);
  const maxCount = Math.max(...counts, 1);

  function handleBarClick(band: 0 | 1 | 2 | 3) {
    onBandClick(selectedBand === band ? null : band);
  }

  const barW = (100 - BAR_GAP * 3) / 4;

  return (
    <div className="widgetPanel">
      <div className="widgetHeader">
        <select
          className="widgetMetricSelect"
          value={metric}
          onChange={(e) => onMetricChange(e.target.value as WidgetMetric)}
          aria-label="Select metric"
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>
        {selectedBand !== null ? (
          <button
            type="button"
            className="widgetClearBtn"
            onClick={() => onBandClick(null)}
            aria-label="Clear selection"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="widgetChart">
        <svg
          className="widgetChartSvg"
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          aria-label={`${METRIC_LABELS[metric]} distribution`}
        >
          {counts.map((count, i) => {
            const x = i * (barW + BAR_GAP);
            const barH = (count / maxCount) * (CHART_HEIGHT - 2);
            const y = CHART_HEIGHT - barH;
            const isSelected = selectedBand === i;
            const isAnySelected = selectedBand !== null;
            const opacity = isAnySelected && !isSelected ? 0.15 : isSelected ? 0.85 : 0.4;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 1)}
                rx="2"
                fill="currentColor"
                fillOpacity={opacity}
                style={{ cursor: "pointer", transition: "fill-opacity 120ms ease" }}
                onClick={() => handleBarClick(i as 0 | 1 | 2 | 3)}
                role="button"
                aria-label={`${BAND_LABELS[i]}: ${count} users`}
                aria-pressed={isSelected}
              />
            );
          })}
        </svg>

        <div className="widgetBarLabels">
          {BAND_LABELS.map((label, i) => (
            <span
              key={label}
              className={
                selectedBand === i
                  ? "widgetBarLabel widgetBarLabelSelected"
                  : "widgetBarLabel"
              }
              onClick={() => handleBarClick(i as 0 | 1 | 2 | 3)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleBarClick(i as 0 | 1 | 2 | 3);
                }
              }}
              aria-label={`${label}: ${counts[i]} users`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 with no errors

---

### Task 5: Wire widgets into dashboard.tsx

**Files:**
- Modify: `components/dashboard.tsx`

- [ ] **Step 1: Add imports**

Find the existing import at the top of `components/dashboard.tsx`:
```tsx
import type { UserWindowMetricRow as MetricRow } from "@/lib/metrics";
```

Add directly after it:
```tsx
import { QuartileBarChart } from "@/components/widgets/QuartileBarChart";
import { PlaceholderPanel } from "@/components/widgets/PlaceholderPanel";
import { type WidgetMetric, getBand, getMetricMax } from "@/components/widgets/quartile-utils";
```

- [ ] **Step 2: Add WidgetState type**

Find this block near the top of the file (around line 36):
```tsx
type FilterCategory = "all" | "groups" | "individuals";
```

Add directly after it:
```tsx
interface WidgetState {
  metric: WidgetMetric;
  selectedBand: 0 | 1 | 2 | 3 | null;
}
```

- [ ] **Step 3: Add widgets useState**

Inside the `Dashboard` function, find the last `useState` before `const filterRef`:
```tsx
const [preferencesReady, setPreferencesReady] = useState(false);
```

Add directly after it:
```tsx
const [widgets, setWidgets] = useState<[WidgetState, WidgetState, WidgetState, WidgetState]>([
  { metric: "usageCount", selectedBand: null },
  { metric: "productivityScore", selectedBand: null },
  { metric: "agentEfficiency", selectedBand: null },
  { metric: "adoptionRate", selectedBand: null },
]);
```

- [ ] **Step 4: Add reset useEffect**

Find the existing `useEffect` that loads metrics (the one that watches `[windowId]`, which calls `loadMetrics`). Add a new `useEffect` directly after it:

```tsx
// Reset widget band selections when time window or filter changes
useEffect(() => {
  setWidgets((prev) =>
    prev.map((w) => ({ ...w, selectedBand: null })) as [WidgetState, WidgetState, WidgetState, WidgetState]
  );
}, [windowId, filterCategory, filterGroupNames, filterIndividualEmails]);
```

- [ ] **Step 5: Add effectiveRows useMemo**

Find this line (around line 567):
```tsx
const analyticsUserCount = analyticsRows.length;
```

Insert the `effectiveRows` useMemo directly before it:
```tsx
const effectiveRows = useMemo(() => {
  const activeWidgets = widgets.filter((w) => w.selectedBand !== null);
  if (activeWidgets.length === 0) return analyticsRows;
  return analyticsRows.filter((row) =>
    activeWidgets.every((w) => {
      const max = getMetricMax(analyticsRows, w.metric);
      return getBand(row[w.metric], w.metric, max) === w.selectedBand;
    })
  );
}, [analyticsRows, widgets]);
```

- [ ] **Step 6: Update analyticsUserCount to use effectiveRows**

Find:
```tsx
const analyticsUserCount = analyticsRows.length;
```

Replace with:
```tsx
const analyticsUserCount = effectiveRows.length;
```

- [ ] **Step 7: Update teamRollup and rowCount to use effectiveRows**

Find:
```tsx
const teamRollup = useMemo(() => {
  return analyticsRows.reduce(
    (acc, row) => {
      acc.usageCount += row.usageCount;
      acc.productivity += row.productivityScore;
      acc.agentEfficiency += row.agentEfficiency;
      acc.tabEfficiency += row.tabEfficiency;
      acc.adoption += row.adoptionRate;
      return acc;
    },
    { usageCount: 0, productivity: 0, agentEfficiency: 0, tabEfficiency: 0, adoption: 0 },
  );
}, [analyticsRows]);

const rowCount = Math.max(analyticsRows.length, 1);
```

Replace with:
```tsx
const teamRollup = useMemo(() => {
  return effectiveRows.reduce(
    (acc, row) => {
      acc.usageCount += row.usageCount;
      acc.productivity += row.productivityScore;
      acc.agentEfficiency += row.agentEfficiency;
      acc.tabEfficiency += row.tabEfficiency;
      acc.adoption += row.adoptionRate;
      return acc;
    },
    { usageCount: 0, productivity: 0, agentEfficiency: 0, tabEfficiency: 0, adoption: 0 },
  );
}, [effectiveRows]);

const rowCount = Math.max(effectiveRows.length, 1);
```

- [ ] **Step 8: Update user table to use effectiveRows**

Find (around line 1186):
```tsx
{analyticsRows.length === 0 ? (
  <tr>
    <td colSpan={9} className="muted">
      No data for the current filter.
    </td>
  </tr>
) : (
  analyticsRows.map((row) => (
```

Replace with:
```tsx
{effectiveRows.length === 0 ? (
  <tr>
    <td colSpan={9} className="muted">
      No data for the current filter.
    </td>
  </tr>
) : (
  effectiveRows.map((row) => (
```

- [ ] **Step 9: Render widget section in JSX**

Find this block in the JSX (the Team Rollup section):
```tsx
<section className="panel">
  <div className="panelHeader">
    <h2>Team Rollup</h2>
  </div>
  <div className="tableWrap">
```

Replace with:
```tsx
<section className="panel">
  <div className="panelHeader">
    <h2>Team Rollup</h2>
  </div>
  <div className="widgetSection">
    <div className="widgetRowFixed">
      <PlaceholderPanel title="Work Type" />
      <PlaceholderPanel title="Categories" />
    </div>
    <div className="widgetRowChangeable">
      {widgets.map((w, i) => (
        <QuartileBarChart
          key={i}
          users={analyticsRows}
          metric={w.metric}
          selectedBand={w.selectedBand}
          onMetricChange={(m) =>
            setWidgets((prev) => {
              const next = [...prev] as [WidgetState, WidgetState, WidgetState, WidgetState];
              next[i] = { metric: m, selectedBand: null };
              return next;
            })
          }
          onBandClick={(band) =>
            setWidgets((prev) => {
              const next = [...prev] as [WidgetState, WidgetState, WidgetState, WidgetState];
              next[i] = { ...next[i], selectedBand: band };
              return next;
            })
          }
        />
      ))}
    </div>
    {effectiveRows.length === 0 && analyticsRows.length > 0 ? (
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0", textAlign: "center" }}>
        No users match the selected widget filters.
      </p>
    ) : null}
  </div>
  <div className="tableWrap">
```

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 with no errors

- [ ] **Step 11: Visual verification**

Run: `npm run dev`
Open http://localhost:3000 and verify:

1. Two dashed placeholder panels ("Work Type", "Categories") appear between the "Team Rollup" heading and the rollup stats table
2. Four bar chart widgets appear below the placeholders, each with a metric dropdown
3. Default metrics are: Total AI Requests, Avg Productivity, Avg Agent Eff., Avg Adoption
4. Bars render with heights proportional to user count in each value-range band
5. Clicking a bar highlights it (high opacity) and dims the others (low opacity)
6. The Team Rollup stats table and user rows below update to show only users in the selected band
7. Clicking a second widget's bar AND-intersects — the table shows only users matching both bands
8. Clicking a selected bar deselects it (restores all users for that widget)
9. The × button appears when a band is selected; clicking it clears only that widget
10. Changing the time window resets all four widget selections
11. Changing the group/individual filter resets all four widget selections
12. When an impossible AND combination is selected, "No users match the selected widget filters." appears above the rollup table and the table shows "No data for the current filter."
