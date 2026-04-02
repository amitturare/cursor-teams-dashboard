import { useCallback, useRef, useState } from "react";
import type { UserWindowMetricRow } from "@/lib/metrics";

interface OverallScorePillProps {
	row: UserWindowMetricRow;
	teamMaxUsage: number;
}

type ScoreTier = { label: string; bg: string; text: string };

const TOOLTIP_APPROX_HEIGHT_PX = 200;
const TOOLTIP_VIEWPORT_MARGIN_PX = 12;

function getTier(score: number): ScoreTier {
	if (score >= 75) return { label: "Excellent", bg: "#9900E6", text: "#fff" };
	if (score >= 50) return { label: "Good", bg: "#11CAE6", text: "#fff" };
	if (score >= 25) return { label: "Fair", bg: "#FF8C42", text: "#fff" };
	return { label: "Low", bg: "#736A85", text: "#fff" };
}

function findClippingAncestor(el: HTMLElement | null): HTMLElement | null {
	let cur = el?.parentElement ?? null;
	while (cur) {
		const style = window.getComputedStyle(cur);
		const { overflow, overflowX, overflowY } = style;
		if ([overflow, overflowX, overflowY].some((value) => value === "auto" || value === "scroll" || value === "hidden")) {
			return cur;
		}
		cur = cur.parentElement;
	}
	return null;
}

function resolveTooltipPlacement(triggerRect: DOMRect, anchorEl: HTMLElement): "above" | "below" {
	const need = TOOLTIP_APPROX_HEIGHT_PX + TOOLTIP_VIEWPORT_MARGIN_PX;
	const clipAncestor = findClippingAncestor(anchorEl);
	if (clipAncestor) {
		const pr = clipAncestor.getBoundingClientRect();
		const spaceAboveInParent = triggerRect.top - pr.top;
		if (spaceAboveInParent < need) return "below";
	}
	const spaceAbove = triggerRect.top;
	const spaceBelow = window.innerHeight - triggerRect.bottom;
	if (spaceAbove < need && spaceBelow >= spaceAbove) return "below";
	if (spaceBelow < need && spaceAbove > spaceBelow) return "above";
	if (spaceAbove < need) return "below";
	return "above";
}

export function OverallScorePill({ row, teamMaxUsage }: OverallScorePillProps) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [showTooltip, setShowTooltip] = useState(false);
	const [placement, setPlacement] = useState<"above" | "below">("above");
	const tier = getTier(row.overallScore);

	const adoptionPts = (row.adoptionRate * 0.3 * 100).toFixed(1);
	const tabPts = (row.tabEfficiency * 0.2 * 100).toFixed(1);
	const agentPts = (row.agentEfficiency * 0.2 * 100).toFixed(1);
	const prodNorm = Math.min(row.productivityScore / 100, 1);
	const prodPts = (prodNorm * 0.2 * 100).toFixed(1);
	const usageNorm = teamMaxUsage > 0 ? row.usageCount / teamMaxUsage : 0;
	const usagePts = (usageNorm * 0.1 * 100).toFixed(1);

	const handleEnter = useCallback(() => {
		const el = wrapRef.current;
		if (el) setPlacement(resolveTooltipPlacement(el.getBoundingClientRect(), el));
		setShowTooltip(true);
	}, []);

	return (
		<div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
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
					userSelect: "none",
				}}
				onMouseEnter={handleEnter}
				onMouseLeave={() => setShowTooltip(false)}
			>
				{row.overallScore.toFixed(1)}
				<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{tier.label}</span>
			</div>

			{showTooltip && (
				<div
					style={{
						position: "absolute",
						...(placement === "above"
							? { bottom: "calc(100% + 6px)" }
							: { top: "calc(100% + 6px)" }),
						left: "50%",
						transform: "translateX(-50%)",
						background: "var(--card, #ffffff)",
						color: "var(--text, #171717)",
						fontSize: 11,
						padding: "10px 12px",
						borderRadius: 10,
						whiteSpace: "nowrap",
						zIndex: 100,
						lineHeight: 1.6,
						border: "1px solid var(--line, #ebe9ef)",
						boxShadow: "0 4px 20px rgba(23, 23, 23, 0.08), 0 0 0 1px rgba(153, 0, 230, 0.06)",
					}}
				>
					<div style={{ fontWeight: 700, marginBottom: 6, color: "var(--accent, #9900e6)" }}>Score Breakdown</div>
					<div style={{ color: "var(--text, #171717)" }}>Adoption 30% → {adoptionPts} pts</div>
					<div style={{ color: "var(--text, #171717)" }}>Tab Eff. 20% → {tabPts} pts</div>
					<div style={{ color: "var(--text, #171717)" }}>Agent Eff. 20% → {agentPts} pts</div>
					<div style={{ color: "var(--text, #171717)" }}>Productivity 20% → {prodPts} pts</div>
					<div style={{ color: "var(--text, #171717)" }}>Usage 10% → {usagePts} pts</div>
					<div
						style={{
							borderTop: "1px solid var(--line, #ebe9ef)",
							marginTop: 6,
							paddingTop: 6,
							fontWeight: 700,
							color: "var(--muted, #736a85)",
						}}
					>
						Total: {row.overallScore.toFixed(1)} / 100 — {tier.label}
					</div>
				</div>
			)}
		</div>
	);
}
