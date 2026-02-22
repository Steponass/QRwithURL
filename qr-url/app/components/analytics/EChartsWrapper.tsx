/**
 * EChartsWrapper component.
 *
 * Handles all the ECharts lifecycle boilerplate:
 *   1. Creates a container <div> with a ref
 *   2. Lazily loads ECharts (async, browser-only via useEffect)
 *   3. Initializes an ECharts instance once loaded
 *   4. Updates the chart when options change
 *   5. Resizes the chart when the window resizes
 *   6. Disposes the instance on unmount (prevents memory leaks)
 *
 * IMPORTANT: This file imports NOTHING from echarts — not even types.
 * The Cloudflare Workers dev runner resolves all imports at module
 * load time, including type imports. Any reference to echarts in the
 * module-level import chain crashes the server.
 *
 * Instead, we use a local ChartOption type (Record<string, any>)
 * and loadEcharts() which only executes inside useEffect.
 */

import { useRef, useEffect, useState } from "react";
import { loadEcharts } from "~/lib/echarts-setup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Local type alias for ECharts option objects.
 * We can't import EChartsOption from echarts (see comment above).
 * Record<string, any> is loose but safe — ECharts validates at runtime.
 * The individual chart components that BUILD these options can use
 * more specific types if needed.
 */
export type ChartOption = Record<string, any>;

interface EChartsWrapperProps {
  /** ECharts configuration object — the chart definition */
  option: ChartOption;
  /** Height of the chart container */
  height: string;
  /** Optional width (defaults to 100%) */
  width?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EChartsWrapper({
  option,
  height,
  width = "100%",
}: EChartsWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // --- Load ECharts and initialize chart on mount ---
  useEffect(() => {
    let disposed = false;

    async function initChart() {
      if (!containerRef.current) return;

      const echarts = await loadEcharts();

      // Component might have unmounted while we were loading
      if (disposed || !containerRef.current) return;

      const chart = echarts.init(containerRef.current);
      chartRef.current = chart;
      chart.setOption(option, true);
      setIsReady(true);
    }

    initChart();

    return () => {
      disposed = true;
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  // --- Update chart when options change ---
  useEffect(() => {
    if (!chartRef.current || !isReady) return;
    chartRef.current.setOption(option, true);
  }, [option, isReady]);

  // --- Handle window resize ---
  useEffect(() => {
    function handleResize() {
      if (chartRef.current) {
        chartRef.current.resize();
      }
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width, height }}
    />
  );
}
