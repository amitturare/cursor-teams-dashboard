import { useEffect, useMemo, useState } from "react";
import type { UserWindowMetricRow, TimeWindow } from "@/lib/metrics";

interface AICommittedChartProps {
  rows: UserWindowMetricRow[];
  window: TimeWindow;
  selectedUserEmail?: string | null;
}

const CHART_H = 120;
const CHART_W = 300;
const PAD = { top: 8, right: 8, bottom: 24, left: 40 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

export function AICommittedChart({ rows, window, selectedUserEmail }: AICommittedChartProps) {
  const [viewMode, setViewMode] = useState<"team" | string>(selectedUserEmail ?? "team");

  // Sync with external drill-down selection
  useEffect(() => {
    setViewMode(selectedUserEmail ?? "team");
  }, [selectedUserEmail]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const userOptions = useMemo(
    () => rows.filter((r) => !r.isRemoved).map((r) => ({ email: r.userEmail, name: r.userName })),
    [rows]
  );

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
          <text x={4} y={PAD.top + INNER_H / 2} fontSize={9} fill="var(--muted)" textAnchor="middle"
            transform={`rotate(-90, 4, ${PAD.top + INNER_H / 2})`}>
            Lines
          </text>
          <text x={CHART_W - 4} y={PAD.top + INNER_H / 2} fontSize={9} fill="var(--coditas-turquoise, #11CAE6)"
            textAnchor="middle" transform={`rotate(90, ${CHART_W - 4}, ${PAD.top + INNER_H / 2})`}>
            Prompts
          </text>

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

          {dailyPoints.length > 1 && (
            <>
              <path
                d={linePath}
                fill="none"
                stroke="var(--coditas-turquoise, #11CAE6)"
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {dailyPoints.map((p, i) => (
                <circle
                  key={`dot-${p.date}`}
                  cx={PAD.left + i * step + step / 2}
                  cy={lineY(p.prompts)}
                  r={3}
                  fill="var(--coditas-turquoise, #11CAE6)"
                />
              ))}
            </>
          )}

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
