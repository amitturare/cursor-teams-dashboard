import { useMemo, useState } from "react";
import type { DailyUsageRow } from "@/lib/cursor-admin";
import type { TimeWindow } from "@/lib/metrics";

interface QuotaChartProps {
  dailyRows: DailyUsageRow[];
  window: TimeWindow;
  quotaCap: number;
  onQuotaCapChange: (cap: number) => void;
  billingCycleResetDate?: string;
}

const CHART_H = 120;
const CHART_W = 300;
const PAD = { top: 8, right: 8, bottom: 24, left: 36 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;
const ANOMALY_THRESHOLD = 0.30;

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function QuotaChart({ dailyRows, window, quotaCap, onQuotaCapChange, billingCycleResetDate }: QuotaChartProps) {
  const [editingCap, setEditingCap] = useState(false);
  const [capInput, setCapInput] = useState(String(quotaCap));
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const dailyPoints = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyRows) {
      if (!row.email) continue;
      const dateStr = new Date(row.date).toISOString().slice(0, 10);
      const existing = map.get(dateStr) ?? 0;
      map.set(dateStr, existing + (row.subscriptionIncludedReqs ?? 0));
    }
    const oneDayMs = 24 * 60 * 60 * 1000;
    const points: Array<{ date: string; used: number; weekend: boolean; anomaly: boolean }> = [];
    let cur = window.startDate;
    while (cur < window.endDate) {
      const dateStr = new Date(cur).toISOString().slice(0, 10);
      const used = map.get(dateStr) ?? 0;
      points.push({ date: dateStr, used, weekend: isWeekend(dateStr), anomaly: used > quotaCap * ANOMALY_THRESHOLD });
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
    if (!isNaN(parsed) && parsed > 0) onQuotaCapChange(parsed);
    setEditingCap(false);
  }

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00Z");
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  };

  return (
    <div className="widgetPanel" style={{ flex: 1 }}>
      <div className="widgetHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 13 }}>Quota Usage</span>
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
            <button type="button" onClick={() => { setCapInput(String(quotaCap)); setEditingCap(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--coditas-violet, #9900E6)", fontWeight: 600, padding: 0 }}>
              {quotaCap} ✎
            </button>
          )}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: "100%", height: "auto", overflow: "visible" }}
          role="img" aria-label="Quota usage chart">
          <line x1={PAD.left} y1={quotaLineY} x2={CHART_W - PAD.right} y2={quotaLineY}
            stroke="var(--coditas-red, #FF174F)" strokeWidth={1} strokeDasharray="4 3" />
          <text x={CHART_W - PAD.right + 2} y={quotaLineY + 3} fontSize={8} fill="var(--coditas-red, #FF174F)">Cap</text>

          {dailyPoints.map((p, i) => {
            const h = Math.max((p.used / maxVal) * INNER_H, 1);
            const x = barX(i);
            const y = PAD.top + INNER_H - h;
            return (
              <rect key={p.date} x={x} y={y} width={barW} height={h} fill={barColor(p)}
                fillOpacity={p.weekend ? 0.6 : 0.85} rx={1}
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

          {dailyPoints.length > 0 && (
            <>
              <text x={PAD.left} y={CHART_H - 4} fontSize={8} fill="var(--muted)" textAnchor="start">{dailyPoints[0].date.slice(5)}</text>
              <text x={CHART_W - PAD.right} y={CHART_H - 4} fontSize={8} fill="var(--muted)" textAnchor="end">{dailyPoints[dailyPoints.length - 1].date.slice(5)}</text>
            </>
          )}
        </svg>

        {tooltip && (
          <div style={{ position: "absolute", left: tooltip.x, top: tooltip.y, background: "var(--text)", color: "#fff",
            fontSize: 11, padding: "4px 8px", borderRadius: 4, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 10, transform: "translateX(-50%)" }}>
            {tooltip.label}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 10, color: "var(--muted)", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "var(--coditas-violet, #9900E6)", display: "inline-block", borderRadius: 2 }} />Weekday
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "var(--line, #EBE9EF)", border: "1px solid #ccc", display: "inline-block", borderRadius: 2 }} />Weekend
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "var(--coditas-red, #FF174F)", display: "inline-block", borderRadius: 2 }} />Anomaly (&gt;30%)
        </span>
        {billingCycleResetDate && <span style={{ marginLeft: "auto" }}>Resets {billingCycleResetDate}</span>}
      </div>
    </div>
  );
}
