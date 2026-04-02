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
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: tier.bg, color: tier.text,
          padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "default", userSelect: "none" }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {row.overallScore.toFixed(1)}
        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{tier.label}</span>
      </div>

      {showTooltip && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#171717", color: "#fff", fontSize: 11, padding: "8px 10px", borderRadius: 6,
          whiteSpace: "nowrap", zIndex: 20, lineHeight: 1.6, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
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
