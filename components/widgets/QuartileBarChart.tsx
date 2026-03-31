import { useEffect, useMemo, useRef, useState } from "react";
import type { UserWindowMetricRow } from "@/lib/metrics";
import {
  type WidgetMetric,
  type WidgetMetricAssignment,
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
  widgetMetrics: WidgetMetricAssignment;
  widgetIndex: 0 | 1 | 2 | 3;
  onMetricChange: (m: WidgetMetric) => void;
  onBandClick: (band: 0 | 1 | 2 | 3 | null) => void;
}

const CHART_HEIGHT = 80;
const BAR_GAP = 6;

export function QuartileBarChart({
  users,
  metric,
  selectedBand,
  widgetMetrics,
  widgetIndex,
  onMetricChange,
  onBandClick,
}: QuartileBarChartProps) {
  const [isMetricMenuOpen, setIsMetricMenuOpen] = useState(false);
  const metricPickerRef = useRef<HTMLDivElement>(null);
  const max = useMemo(() => getMetricMax(users, metric), [users, metric]);
  const counts = useMemo(() => computeBandCounts(users, metric, max), [users, metric, max]);
  const maxCount = Math.max(...counts, 1);

  function handleBarClick(band: 0 | 1 | 2 | 3) {
    onBandClick(selectedBand === band ? null : band);
  }

  useEffect(() => {
    if (!isMetricMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        metricPickerRef.current &&
        !metricPickerRef.current.contains(event.target as Node)
      ) {
        setIsMetricMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMetricMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMetricMenuOpen]);

  const barW = (100 - BAR_GAP * 3) / 4;

  return (
    <div className="widgetPanel">
      <div className="widgetHeader">
        <div className="widgetMetricPicker" ref={metricPickerRef}>
          <button
            type="button"
            className="widgetMetricTrigger"
            id={`widget-metric-trigger-${widgetIndex}`}
            aria-haspopup="listbox"
            aria-expanded={isMetricMenuOpen}
            aria-controls={`widget-metric-list-${widgetIndex}`}
            onClick={() => setIsMetricMenuOpen((open) => !open)}
          >
            <span className="widgetMetricTriggerLabel">{METRIC_LABELS[metric]}</span>
            <span className="widgetMetricTriggerChevron" aria-hidden>
              ▼
            </span>
          </button>
          {isMetricMenuOpen ? (
            <ul
              className="widgetMetricMenu"
              id={`widget-metric-list-${widgetIndex}`}
              role="listbox"
              aria-labelledby={`widget-metric-trigger-${widgetIndex}`}
            >
              {METRIC_OPTIONS.map((m) => {
                const isCurrentWidgetMetric = widgetMetrics[widgetIndex] === m;
                const isAssignedToSomeWidget = widgetMetrics.some((x) => x === m);
                return (
                  <li key={m} role="presentation">
                    <button
                      type="button"
                      className={
                        isCurrentWidgetMetric
                          ? "widgetMetricMenuItem widgetMetricMenuItemCurrent"
                          : "widgetMetricMenuItem"
                      }
                      role="option"
                      aria-selected={isCurrentWidgetMetric}
                      onClick={() => {
                        onMetricChange(m);
                        setIsMetricMenuOpen(false);
                      }}
                    >
                      <span className="widgetMetricTick" aria-hidden>
                        {isAssignedToSomeWidget ? "✓" : "\u00a0"}
                      </span>
                      <span className="widgetMetricMenuLabel">{METRIC_LABELS[m]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
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
          preserveAspectRatio="xMidYMax meet"
          role="group"
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
                key={BAND_LABELS[i]}
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 1)}
                rx="2"
                fill="currentColor"
                fillOpacity={opacity}
                style={{ cursor: "pointer", transition: "fill-opacity 120ms ease" }}
                onClick={() => handleBarClick(i as 0 | 1 | 2 | 3)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleBarClick(i as 0 | 1 | 2 | 3);
                  }
                }}
                tabIndex={0}
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
              aria-pressed={selectedBand === i}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
