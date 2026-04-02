import { useState } from "react";
import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";

export function MetricDefinitionsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12,
          color: "var(--coditas-violet, #9900E6)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
        {open ? "▴" : "▾"} {open ? "Hide" : "Show"} metric definitions
      </button>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {METRIC_DEFINITIONS.map((def) => (
            <div key={def.name} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 14 }}>{def.name}</span>
                <span style={{ fontSize: 11, color: "#fff", background: "var(--coditas-violet, #9900E6)",
                  padding: "1px 7px", borderRadius: 999, fontWeight: 500 }}>{def.unit}</span>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text)" }}>{def.tagline}</p>
              <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 }}>
                <div><strong>Formula:</strong> {def.formula}</div>
                <div><strong>Source:</strong> {def.source}</div>
                <div><strong>Interpret:</strong> {def.interpret}</div>
                {def.warning && (
                  <div style={{ marginTop: 4, background: "rgba(255,23,79,0.06)", border: "1px solid rgba(255,23,79,0.2)",
                    borderRadius: 4, padding: "4px 8px", color: "var(--coditas-red, #FF174F)" }}>
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
