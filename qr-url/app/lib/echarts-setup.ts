/**
 * echarts-setup.ts
 *
 * Central ECharts configuration with tree-shaking.
 *
 * CRITICAL ARCHITECTURE NOTE:
 * Cloudflare Workers' dev runner resolves ALL imports when loading
 * a module — including `import type` and dynamic `import()` calls.
 * ECharts uses DOM/Canvas APIs that don't exist in Workers.
 *
 * Solution: This file exports ZERO imports from echarts at the
 * module level. Not even type imports. The loadEcharts() function
 * is the ONLY way to access echarts, and it must only be called
 * from inside useEffect (which only runs in the browser).
 *
 * The chart component files also avoid importing from echarts —
 * they define their option objects using a local type alias.
 */

// No echarts imports here — not even `import type`!

let echartsCore: any = null;

/**
 * Lazily loads and configures ECharts.
 * Must ONLY be called from client-side code (useEffect, event handlers).
 *
 * On first call: dynamically imports echarts modules + registers them.
 * On subsequent calls: returns the cached instance immediately.
 *
 * @returns The echarts core module (with .init(), .use(), etc.)
 */
export async function loadEcharts(): Promise<any> {
  if (echartsCore) {
    return echartsCore;
  }

  const [
    core,
    charts,
    components,
    renderers,
  ] = await Promise.all([
    import("echarts/core"),
    import("echarts/charts"),
    import("echarts/components"),
    import("echarts/renderers"),
  ]);

  core.use([
    charts.LineChart,
    charts.PieChart,
    charts.BarChart,
    charts.HeatmapChart,
    components.TooltipComponent,
    components.GridComponent,
    components.LegendComponent,
    components.VisualMapComponent,
    renderers.CanvasRenderer,
  ]);

  echartsCore = core;
  return core;
}