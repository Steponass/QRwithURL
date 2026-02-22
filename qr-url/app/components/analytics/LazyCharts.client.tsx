/**
 * LazyCharts.client.tsx
 *
 * Client-only wrapper that renders all ECharts-based analytics charts
 * along with the grid layout they live in.
 *
 * WHY THIS FILE EXISTS:
 * The Cloudflare Workers SSR environment resolves all imports when
 * loading a module — even transitive ones. The chart components
 * import EChartsWrapper → echarts-setup.ts, which contains dynamic
 * import("echarts/...") calls. Although those imports are inside a
 * function body, the Workers dev runner still trips over them during
 * module resolution, causing "Could not resolve module for file"
 * and breaking the entire analytics route loader.
 *
 * SOLUTION:
 * This file uses the React Router ".client.tsx" convention. Files
 * with .client in their name are NEVER loaded during SSR — React
 * Router excludes them from the server module graph entirely.
 *
 * The analytics route uses React.lazy() to import this file,
 * wrapped in <Suspense>. During SSR the lazy component renders as
 * its fallback. On the client it loads normally.
 *
 * LAYOUT NOTE:
 * ReferrerList (SSR-safe, no ECharts) is included here because it
 * shares a 2-column grid with DeviceBreakdownChart. Keeping them
 * in the same component avoids splitting a CSS grid across a
 * lazy/non-lazy boundary.
 */

import { ClickTimelineChart } from "~/components/analytics/ClickTimelineChart";
import { ReferrerList } from "~/components/analytics/ReferrerList";
import { DeviceBreakdownChart } from "~/components/analytics/DeviceBreakdownChart";
import { CountryBreakdownChart } from "~/components/analytics/CountryBreakdownChart";
import { ActivityHeatmapChart } from "~/components/analytics/ActivityHeatmapChart";
import type {
  TimelineDay,
  ReferrerEntry,
  DeviceEntry,
  CountryEntry,
  HeatmapCell,
} from "~/lib/analytics-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LazyChartsSectionProps {
  timeline: TimelineDay[];
  referrers: ReferrerEntry[];
  devices: DeviceEntry[];
  countries: CountryEntry[];
  heatmap: HeatmapCell[];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const TWO_COLUMN_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "1.5rem",
  marginBottom: "1.5rem",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LazyChartsSection({
  timeline,
  referrers,
  devices,
  countries,
  heatmap,
}: LazyChartsSectionProps) {
  return (
    <>
      {/* --- Click timeline (full width) --- */}
      <ClickTimelineChart timeline={timeline} />

      {/* --- Two-column grid: referrers + devices --- */}
      <div style={TWO_COLUMN_GRID}>
        <ReferrerList referrers={referrers} />
        <DeviceBreakdownChart devices={devices} />
      </div>

      {/* --- Two-column grid: countries + heatmap --- */}
      <div style={TWO_COLUMN_GRID}>
        <CountryBreakdownChart countries={countries} />
        <ActivityHeatmapChart heatmapData={heatmap} />
      </div>
    </>
  );
}
