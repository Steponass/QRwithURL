/**
 * ClickTimelineChart component.
 *
 * ECharts line chart showing click activity over the last 30 days.
 * Two lines:
 *   - Total clicks (blue, solid) — free tier
 *   - Unique visitors (purple, dashed) — paid tier
 *
 * Both lines are always rendered. The tier gating will happen
 * at the page level by choosing whether to pass unique data.
 * For now we build the full chart.
 *
 * The chart uses an area fill under the total clicks line to
 * make the trend more visually prominent. The unique visitors
 * line is dashed to differentiate it clearly.
 */

import { useMemo } from "react";
import { EChartsWrapper } from "~/components/analytics/EChartsWrapper";
import type { ChartOption } from "~/components/analytics/EChartsWrapper";
import type { TimelineDay } from "~/lib/analytics-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClickTimelineChartProps {
  timeline: TimelineDay[];
  /** Whether to show the unique visitors line (pro tier only) */
  showUniqueOverlay: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClickTimelineChart({ timeline, showUniqueOverlay }: ClickTimelineChartProps) {
  /**
   * useMemo prevents rebuilding the option object on every render.
   * ECharts does a deep comparison internally, but building the
   * object is still work we can skip if the data hasn't changed.
   */
  const option = useMemo(
    () => buildChartOption(timeline, showUniqueOverlay),
    [timeline, showUniqueOverlay]
  );

  if (timeline.length === 0) {
    return <EmptyState />;
  }

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Clicks — Last 30 Days</h3>
      <EChartsWrapper option={option} height="280px" />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chart option builder
// ---------------------------------------------------------------------------

/**
 * Builds the ECharts option object for the timeline.
 *
 * ECharts options are plain objects that describe the entire chart:
 *   - xAxis: the date labels along the bottom
 *   - yAxis: the click count scale
 *   - series: the actual data lines
 *   - tooltip: what shows on hover
 *   - grid: spacing/margins around the chart area
 */
function buildChartOption(timeline: TimelineDay[], showUniqueOverlay: boolean): ChartOption {
  const dates = timeline.map((day) => formatDateLabel(day.date));
  const clicks = timeline.map((day) => day.clicks);

  const legendData = ["Total Clicks"];
  if (showUniqueOverlay) {
    legendData.push("Unique Visitors");
  }

  const series: any[] = [
    {
      name: "Total Clicks",
      type: "line",
      data: clicks,
      smooth: true,
      symbol: "none",
      lineStyle: { color: "#3b82f6", width: 2 },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(59, 130, 246, 0.15)" },
            { offset: 1, color: "rgba(59, 130, 246, 0.01)" },
          ],
        },
      },
    },
  ];

  if (showUniqueOverlay) {
    const unique = timeline.map((day) => day.uniqueVisitors);
    series.push({
      name: "Unique Visitors",
      type: "line",
      data: unique,
      smooth: true,
      symbol: "none",
      lineStyle: {
        color: "#8b5cf6",
        width: 2,
        type: "dashed",
      },
    });
  }

  return {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#e5e7eb",
      textStyle: { color: "#1f2937", fontSize: 13 },
    },
    legend: {
      data: legendData,
      bottom: 0,
      textStyle: { fontSize: 12, color: "#6b7280" },
    },
    grid: {
      top: 10,
      right: 16,
      bottom: 40,
      left: 40,
      containLabel: false,
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisLabel: {
        color: "#9ca3af",
        fontSize: 11,
        /**
         * Show every 5th label to avoid crowding.
         * 30 labels on a ~500px chart would overlap.
         */
        interval: 4,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: "#9ca3af", fontSize: 11 },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    series,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Clicks — Last 30 Days</h3>
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "#9ca3af",
          border: "1px dashed #d1d5db",
          borderRadius: "8px",
        }}
      >
        No clicks recorded yet
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats "2026-02-15" → "Feb 15"
 * Short format that fits on the x-axis.
 */
function formatDateLabel(isoDate: string): string {
  const date = new Date(isoDate + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}