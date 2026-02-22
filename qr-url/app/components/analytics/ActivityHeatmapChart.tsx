/**
 * ActivityHeatmapChart component.
 *
 * ECharts heatmap showing click activity by day-of-week (rows)
 * and hour-of-day (columns). The color intensity represents
 * the number of clicks in each time slot.
 *
 * This is the most distinctive analytics feature. It tells
 * a marketer: "Your audience clicks your links mostly on
 * Tuesday afternoons and Thursday mornings" — which helps
 * them schedule campaigns and social media posts.
 *
 * Grid: 7 rows (Sun-Sat) × 24 columns (00:00-23:00 UTC)
 * Color: white (0 clicks) → deep blue (max clicks)
 *
 * Paid tier feature.
 */

import { useMemo } from "react";
import { EChartsWrapper } from "~/components/analytics/EChartsWrapper";
import type { ChartOption } from "~/components/analytics/EChartsWrapper";
import type { HeatmapCell } from "~/lib/analytics-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityHeatmapChartProps {
  heatmapData: HeatmapCell[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Hour labels for the x-axis.
 * Show every 3rd hour to avoid crowding: 0, 3, 6, 9, 12, 15, 18, 21
 */
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  return `${String(i).padStart(2, "0")}:00`;
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActivityHeatmapChart({
  heatmapData,
}: ActivityHeatmapChartProps) {
  const option = useMemo(() => buildChartOption(heatmapData), [heatmapData]);

  if (heatmapData.length === 0) {
    return (
      <section>
        <h3>Activity by Time (UTC)</h3>
        <p>
          No activity data yet
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3>Activity by Time (UTC)</h3>
      <EChartsWrapper option={option} height="240px" />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chart option builder
// ---------------------------------------------------------------------------

function buildChartOption(heatmapData: HeatmapCell[]): ChartOption {
  /**
   * ECharts heatmap expects data as [x, y, value] arrays.
   * x = hour (column index), y = day of week (row index).
   *
   * We also need to fill in zeros for time slots with no clicks,
   * because ECharts doesn't render missing cells — they'd be blank.
   */
  const dataMap = new Map<string, number>();

  for (const cell of heatmapData) {
    const key = `${cell.hour}-${cell.dayOfWeek}`;
    dataMap.set(key, cell.clicks);
  }

  const chartData: [number, number, number][] = [];
  let maxClicks = 0;

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${hour}-${day}`;
      const clicks = dataMap.get(key) ?? 0;
      chartData.push([hour, day, clicks]);

      if (clicks > maxClicks) {
        maxClicks = clicks;
      }
    }
  }

  return {
    tooltip: {
      position: "top",
      formatter: (params: any) => {
        const [hour, day, clicks] = params.value;
        const dayName = DAY_LABELS[day];
        const hourLabel = HOUR_LABELS[hour];
        return `${dayName} ${hourLabel}<br/>${clicks} click${clicks !== 1 ? "s" : ""}`;
      },
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#e5e7eb",
      textStyle: { color: "#1f2937", fontSize: 13 },
    },
    grid: {
      top: 8,
      right: 16,
      bottom: 40,
      left: 40,
    },
    xAxis: {
      type: "category",
      data: HOUR_LABELS,
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisLabel: {
        color: "#9ca3af",
        fontSize: 10,
        interval: 2,
      },
      axisTick: { show: false },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: DAY_LABELS,
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisLabel: { color: "#374151", fontSize: 11 },
      axisTick: { show: false },
      splitArea: { show: false },
    },
    visualMap: {
      min: 0,
      max: Math.max(maxClicks, 1),
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 12,
      itemHeight: 80,
      textStyle: { color: "#9ca3af", fontSize: 10 },
      inRange: {
        color: [
          "#eef2ff",
          "#c7d2fe",
          "#818cf8",
          "#4f46e5",
          "#3730a3",
        ],
      },
    },
    series: [
      {
        type: "heatmap",
        data: chartData,
        emphasis: {
          itemStyle: {
            borderColor: "#1f2937",
            borderWidth: 1,
          },
        },
      },
    ],
  };
}
