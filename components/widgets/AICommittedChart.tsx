import { useMemo, useState } from "react";
import type { UserWindowMetricRow } from "@/lib/metrics";

interface AICommittedChartProps {
	rows: UserWindowMetricRow[];
}

const CHART_H = 248;
const CHART_W = 520;
const PAD = { top: 10, right: 8, bottom: 8, left: 8 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;
const BAR_WIDTH_FRACTION = 0.84;

export function AICommittedChart({ rows }: AICommittedChartProps) {
	const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

	const dailyPoints = useMemo(() => {
		const map = new Map<string, { acceptedLines: number; prompts: number }>();
		for (const row of rows) {
			for (const pt of row.dailyTrend) {
				const existing = map.get(pt.date) ?? { acceptedLines: 0, prompts: 0 };
				map.set(pt.date, {
					acceptedLines: existing.acceptedLines + pt.acceptedLines,
					prompts: existing.prompts + pt.prompts,
				});
			}
		}
		return Array.from(map.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, vals]) => ({ date, ...vals }));
	}, [rows]);

	let maxAccepted = 1;
	let maxPrompts = 1;
	for (const p of dailyPoints) {
		if (p.acceptedLines > maxAccepted) maxAccepted = p.acceptedLines;
		if (p.prompts > maxPrompts) maxPrompts = p.prompts;
	}
	const n = dailyPoints.length || 1;
	const step = INNER_W / n;
	const barW = Math.max(6, step * BAR_WIDTH_FRACTION);

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
		<div className="widgetPanel aiCommittedChartPanel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
			<div
				className="widgetHeader"
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					gap: 16,
					flexWrap: "wrap",
					marginBottom: 4,
					flexShrink: 0,
				}}
			>
				<div style={{ flex: "1 1 auto", minWidth: 0 }}>
					<div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 13 }}>
						AI Committed vs Prompts
					</div>
					<div className="aiCommittedChartHeaderSpacer" aria-hidden>
						&nbsp;
					</div>
				</div>
				<div
					style={{
						display: "flex",
						gap: 12,
						fontSize: 10,
						color: "var(--muted)",
						alignItems: "center",
						flexShrink: 0,
						marginLeft: "auto",
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
							}}
						/>
						Accepted Lines
					</span>
					<span style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
						<span
							style={{
								width: 10,
								height: 2,
								background: "var(--coditas-turquoise, #11CAE6)",
								display: "inline-block",
							}}
						/>
						Prompts
					</span>
				</div>
			</div>

			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					width: "100%",
					flex: "1 1 auto",
					minHeight: 220,
					alignItems: "stretch",
				}}
			>
				<svg
					viewBox={`0 0 ${CHART_W} ${CHART_H}`}
					preserveAspectRatio="xMidYMax meet"
					style={{
						width: "100%",
						height: "100%",
						minHeight: 200,
						display: "block",
						overflow: "visible",
						flex: "1 1 auto",
					}}
					role="img"
					aria-label="AI Committed Lines vs Prompts chart"
				>
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
										label: `${p.date}: ${p.acceptedLines} lines · ${p.prompts} prompts`,
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

				</svg>

				{dailyPoints.length > 0 ? (
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							width: "100%",
							marginTop: 2,
							paddingTop: 0,
							paddingBottom: 2,
							flexShrink: 0,
							gap: 8,
						}}
					>
						<span className="widgetBarLabel" style={{ textAlign: "left", cursor: "default" }}>
							{dailyPoints[0].date.slice(5)}
						</span>
						<span className="widgetBarLabel" style={{ textAlign: "right", cursor: "default" }}>
							{dailyPoints[dailyPoints.length - 1].date.slice(5)}
						</span>
					</div>
				) : null}

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
							transform: "translateX(-50%)",
						}}
					>
						{tooltip.label}
					</div>
				)}
			</div>
		</div>
	);
}
