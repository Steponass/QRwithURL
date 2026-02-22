/**
 * DeviceBreakdownChart component.
 *
 * ECharts donut (pie with hole) chart showing the device type
 * distribution: mobile, desktop, tablet.
 *
 * Why donut over pie?
 *   The center hole displays the total count, which adds context.
 *   Donut charts also feel more modern and are slightly easier to
 *   read because the arc lengths are more distinct than wedge areas.
 *
 * Paid tier feature — we build it now but will gate access later.
 */

import { useMemo } from "react";
import { EChartsWrapper } from "~/components/analytics/EChartsWrapper";
import type { ChartOption } from "~/components/analytics/EChartsWrapper";
import type { DeviceEntry } from "~/lib/analytics-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeviceBreakdownChartProps {
  devices: DeviceEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Colors for each device type.
 * Consistent colors help users recognize categories at a glance
 * without reading the legend every time.
 */
const DEVICE_COLORS: Record<string, string> = {
  desktop: "#3b82f6",
  mobile: "#8b5cf6",
  tablet: "#f59e0b",
  unknown: "#9ca3af",
};

/**
 * Capitalize device names for display.
 */
const DEVICE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  unknown: "Unknown",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeviceBreakdownChart({ devices }: DeviceBreakdownChartProps) {
  const totalClicks = devices.reduce((sum, d) => sum + d.clicks, 0);
  const option = useMemo(() => buildChartOption(devices, totalClicks), [devices, totalClicks]);

  if (devices.length === 0) {
    return (
      <section>
        <h3>Devices</h3>
        <p>
          No device data yet
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3>Devices</h3>
      <EChartsWrapper option={option} height="240px" />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chart option builder
// ---------------------------------------------------------------------------

function buildChartOption(
  devices: DeviceEntry[],
  totalClicks: number
): ChartOption {
  const chartData = devices.map((d) => ({
    name: DEVICE_LABELS[d.device] ?? d.device,
    value: d.clicks,
    itemStyle: {
      color: DEVICE_COLORS[d.device] ?? "#9ca3af",
    },
  }));

  return {
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#e5e7eb",
      textStyle: { color: "#1f2937", fontSize: 13 },
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 12, color: "#6b7280" },
    },
    series: [
      {
        type: "pie",
        /**
         * radius: [inner, outer]
         * The inner radius creates the donut hole.
         * "40%" inner + "70%" outer gives a nice proportion.
         */
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: true,
        /**
         * Display the total in the center of the donut.
         * This "label" is actually the label for the series,
         * positioned at the center when no item is highlighted.
         */
        label: {
          show: true,
          position: "center",
          formatter: `{total|${totalClicks.toLocaleString("en-US")}}\n{subtitle|total}`,
          rich: {
            total: {
              fontSize: 22,
              fontWeight: "bold",
              color: "#1f2937",
              lineHeight: 30,
            },
            subtitle: {
              fontSize: 12,
              color: "#9ca3af",
            },
          },
        },
        /**
         * On hover, show the individual item's label instead
         * of the center total.
         */
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
            formatter: "{b}\n{d}%",
          },
        },
        data: chartData,
      },
    ],
  };
}
