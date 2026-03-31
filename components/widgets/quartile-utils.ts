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

/** The four widget slots must use four distinct metrics (one metric is unused). */
export type WidgetMetricAssignment = readonly [
  WidgetMetric,
  WidgetMetric,
  WidgetMetric,
  WidgetMetric,
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
