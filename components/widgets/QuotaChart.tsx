import { useMemo, useState } from "react";

export interface PremiumQuotaBarPoint {
  id: string;
  /** Full display name (tooltips); not truncated. */
  label: string;
  value: number;
}

interface QuotaChartProps {
  /** Per-member `fastPremiumRequests` from GET /api/spend (POST /teams/spend), filtered to the visible cohort. */
  premiumBars: PremiumQuotaBarPoint[];
  isLoading?: boolean;
  /**
   * Reference cap from settings (not shown). Red bars only when usage is above 50% of this value
   * and today (UTC) falls in the first 10 calendar days of the billing cycle.
   */
  quotaCap: number;
  /** Same line as AI Committed chart — from spend cycle (e.g. "Cycle from … · First 10 …"). */
  billingCycleSubtitle: string;
  /** Unix ms for cycle start (`subscriptionCycleStart`); required for early-cycle red shading. */
  billingCycleStartMs?: number;
}

const CHART_H = 260;
const CHART_W = 520;
const PAD = { top: 4, right: 8, bottom: 10, left: 8 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;
const ANOMALY_USAGE_FRACTION = 0.5;
const EARLY_CYCLE_DAY_COUNT = 10;

function startOfUtcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isWithinFirstDaysOfBillingCycleUtc(cycleStartMs: number, dayCount: number, now: Date): boolean {
  if (!Number.isFinite(cycleStartMs) || cycleStartMs <= 0) return false;
  const cycleDayStart = startOfUtcDayMs(new Date(cycleStartMs));
  const todayStart = startOfUtcDayMs(now);
  const endExclusive = cycleDayStart + dayCount * 24 * 60 * 60 * 1000;
  return todayStart >= cycleDayStart && todayStart < endExclusive;
}

function isPremiumUsageAnomalous(value: number, quotaCap: number, billingCycleStartMs: number | undefined): boolean {
  if (quotaCap <= 0) return false;
  if (value <= quotaCap * ANOMALY_USAGE_FRACTION) return false;
  if (billingCycleStartMs == null) return false;
  return isWithinFirstDaysOfBillingCycleUtc(billingCycleStartMs, EARLY_CYCLE_DAY_COUNT, new Date());
}

export function QuotaChart({
  premiumBars,
  isLoading = false,
  quotaCap,
  billingCycleSubtitle,
  billingCycleStartMs
}: QuotaChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const maxVal = useMemo(() => {
    let max = 1;
    for (const p of premiumBars) {
      if (p.value > max) max = p.value;
    }
    return max;
  }, [premiumBars]);
  const n = Math.max(premiumBars.length, 1);
  const step = INNER_W / n;
  const barW = Math.max(6, step * 0.84);

  function barFill(value: number): string {
    if (isPremiumUsageAnomalous(value, quotaCap, billingCycleStartMs)) return "var(--coditas-red, #FF174F)";
    return "var(--coditas-violet, #9900E6)";
  }

  const barX = (i: number) => PAD.left + i * step + step / 2 - barW / 2;

  return (
    <div className="widgetPanel quotaChartPanel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        className="widgetHeader"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 4,
          flexShrink: 0
        }}
      >
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 13 }}>
            Usage-based premium requests
          </div>
          <div className="billingCycleSubtitle">{billingCycleSubtitle}</div>
        </div>
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            fontSize: 10,
            color: "var(--muted)",
            marginLeft: "auto",
            justifyContent: "flex-end"
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <span
              style={{
                width: 10,
                height: 10,
                background: "var(--coditas-violet, #9900E6)",
                display: "inline-block",
                borderRadius: 2,
                flexShrink: 0
              }}
            />
            Normal
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <span
              style={{
                width: 10,
                height: 10,
                background: "var(--coditas-red, #FF174F)",
                display: "inline-block",
                borderRadius: 2,
                flexShrink: 0
              }}
            />
            &gt;50% of ref
          </span>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          opacity: isLoading ? 0.45 : 1,
          width: "100%",
          flex: "1 1 auto",
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch"
        }}
      >
        {isLoading ? (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "var(--muted)",
              zIndex: 2,
              pointerEvents: "none"
            }}
          >
            Loading spend…
          </span>
        ) : null}
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            width: "100%",
            height: "100%",
            minHeight: 180,
            display: "block",
            overflow: "visible",
            flex: "1 1 auto"
          }}
          role="img"
          aria-label="Usage-based premium requests per member from team spend"
        >
          {premiumBars.map((p, i) => {
            const h = Math.max((p.value / maxVal) * INNER_H, p.value > 0 ? 2 : 0);
            const x = barX(i);
            const y = PAD.top + INNER_H - h;
            return (
              <rect
                key={p.id}
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                fill={barFill(p.value)}
                fillOpacity={0.85}
                rx={1}
                onMouseEnter={(e) => {
                  const svgRect = (e.currentTarget.closest("svg") as SVGSVGElement).getBoundingClientRect();
                  const pct = quotaCap > 0 ? ((p.value / quotaCap) * 100).toFixed(0) : "0";
                  const warn = isPremiumUsageAnomalous(p.value, quotaCap, billingCycleStartMs);
                  const label = `${p.label}\n${p.id}\n${p.value} fast premium req. · ${pct}% of reference${warn ? "\n⚠ Early-cycle threshold" : ""}`;
                  setTooltip({
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top - 12,
                    label
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {premiumBars.length === 0 ? (
            <text x={CHART_W / 2} y={PAD.top + INNER_H / 2} fontSize={10} fill="var(--muted)" textAnchor="middle">
              No members in view
            </text>
          ) : null}
        </svg>

        {premiumBars.length > 0 ? <div className="quotaChartAxisCaption">Top 10 Users</div> : null}

        {tooltip ? (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              background: "var(--text)",
              color: "#fff",
              fontSize: 11,
              padding: "6px 10px",
              borderRadius: 4,
              pointerEvents: "none",
              whiteSpace: "pre-line",
              zIndex: 10,
              transform: "translateX(-50%)",
              textAlign: "left",
              lineHeight: 1.4,
              maxWidth: 280,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)"
            }}
          >
            {tooltip.label}
          </div>
        ) : null}
      </div>
    </div>
  );
}
