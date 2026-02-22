/**
 * CountryBreakdownChart component.
 *
 * ECharts horizontal bar chart showing the top 5 countries
 * by click count.
 *
 * Why horizontal bars?
 *   Country names vary in length ("US" vs "United Kingdom").
 *   Horizontal bars put labels on the y-axis where there's
 *   room. Vertical bars would require angled or truncated labels.
 *
 * We display country codes as-is (e.g. "US", "DE", "JP").
 * Full country name mapping could be added later, but codes
 * are universally recognized and keep the code simple.
 *
 * Paid tier feature.
 */

import { useMemo } from "react";
import { EChartsWrapper } from "~/components/analytics/EChartsWrapper";
import type { ChartOption } from "~/components/analytics/EChartsWrapper";
import type { CountryEntry } from "~/lib/analytics-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CountryBreakdownChartProps {
  countries: CountryEntry[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CountryBreakdownChart({
  countries,
}: CountryBreakdownChartProps) {
  const option = useMemo(() => buildChartOption(countries), [countries]);

  if (countries.length === 0) {
    return (
      <section>
        <h3>Countries</h3>
        <p>
          No country data yet
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3>Countries</h3>
      <EChartsWrapper option={option} height="200px" />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chart option builder
// ---------------------------------------------------------------------------

function buildChartOption(countries: CountryEntry[]): ChartOption {
  /**
   * Reverse the array so the highest value is at the top.
   * ECharts renders y-axis categories bottom-to-top by default,
   * so reversing puts #1 at the top of the chart.
   */
  const reversed = [...countries].reverse();
  const labels = reversed.map((c) => c.country);
  const values = reversed.map((c) => c.clicks);

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const item = Array.isArray(params) ? params[0] : params;
        const entry = countries.find((c) => c.country === item.name);
        const pct = entry?.percentage ?? 0;
        return `${item.name}: ${item.value} clicks (${pct}%)`;
      },
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#e5e7eb",
      textStyle: { color: "#1f2937", fontSize: 13 },
    },
    grid: {
      top: 8,
      right: 16,
      bottom: 8,
      left: 50,
      containLabel: false,
    },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: "#9ca3af", fontSize: 11 },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisLabel: { color: "#374151", fontSize: 12 },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: values,
        barWidth: "60%",
        itemStyle: {
          color: "#10b981",
          borderRadius: [0, 4, 4, 0],
        },
      },
    ],
  };
}
