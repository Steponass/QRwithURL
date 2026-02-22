/**
 * analytics-queries.ts
 *
 * All D1 queries for the analytics dashboard.
 * Server-side only — called from route loaders.
 *
 * Each function takes a D1 database handle and a URL ID,
 * and returns structured data ready for components.
 *
 * Design principle: one function per "card" on the analytics page.
 * This keeps queries focused, independently testable, and easy
 * to enable/disable per tier without touching other queries.
 *
 * Note on dates: D1/SQLite stores dates as TEXT in ISO 8601 format.
 * datetime('now') produces UTC. All date comparisons are string-based
 * which works correctly for ISO format.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Basic URL info displayed at the top of the analytics page.
 * Verifies the URL exists and belongs to the requesting user.
 */
export interface UrlInfo {
  id: number;
  shortcode: string;
  originalUrl: string;
  subdomain: string | null;
  createdAt: string;
}

/**
 * Summary stats: the "big numbers" at the top of the page.
 */
export interface AnalyticsSummary {
  totalClicks: number;
  uniqueVisitors: number;
  lastClickedAt: string | null;
}

/**
 * One day's worth of click data for the timeline chart.
 * The chart receives an array of these, one per day for 30 days.
 */
export interface TimelineDay {
  /** Date string: "2026-02-15" */
  date: string;
  /** Total clicks on this day */
  clicks: number;
  /** Unique visitor hashes on this day */
  uniqueVisitors: number;
}

/**
 * A single referrer entry for the "Top Referrers" table.
 */
export interface ReferrerEntry {
  /** Hostname like "twitter.com" or "Direct / None" for null referrers */
  source: string;
  /** Number of clicks from this source */
  clicks: number;
  /** Percentage of total clicks (0-100) */
  percentage: number;
}

/**
 * A device type entry for the donut chart.
 */
export interface DeviceEntry {
  /** "mobile", "desktop", or "tablet" */
  device: string;
  /** Number of clicks from this device type */
  clicks: number;
  /** Percentage of total clicks (0-100) */
  percentage: number;
}

/**
 * A country entry for the horizontal bar chart.
 */
export interface CountryEntry {
  /** ISO country code like "US", "DE", or "Unknown" */
  country: string;
  /** Number of clicks from this country */
  clicks: number;
  /** Percentage of total clicks (0-100) */
  percentage: number;
}

/**
 * One cell in the activity heatmap.
 * The heatmap is a 7 (days) × 24 (hours) grid showing
 * when clicks happen most frequently.
 */
export interface HeatmapCell {
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  dayOfWeek: number;
  /** 0-23 (UTC) */
  hour: number;
  /** Number of clicks in this day+hour bucket */
  clicks: number;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetches basic URL info and verifies ownership.
 * Returns null if the URL doesn't exist or doesn't belong to this user.
 *
 * This is the first query every analytics page load makes.
 * If it returns null, we show a 404 — no point running other queries.
 */
export async function fetchUrlInfo(
  db: D1Database,
  urlId: number,
  userId: string
): Promise<UrlInfo | null> {
  const row = await db
    .prepare(
      `SELECT id, shortcode, original_url, subdomain, created_at
       FROM urls
       WHERE id = ? AND user_id = ?`
    )
    .bind(urlId, userId)
    .first<{
      id: number;
      shortcode: string;
      original_url: string;
      subdomain: string | null;
      created_at: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    shortcode: row.shortcode,
    originalUrl: row.original_url,
    subdomain: row.subdomain,
    createdAt: row.created_at,
  };
}

/**
 * Fetches the summary stats: total clicks, unique visitors, last click.
 *
 * Runs two queries:
 *   1. COUNT(*) for total clicks + MAX(clicked_at) for last click
 *   2. COUNT(DISTINCT visitor_hash) for unique visitors
 *
 * Why two queries instead of one? SQLite can combine COUNT(*) and MAX
 * efficiently in a single scan, but COUNT(DISTINCT) forces a different
 * execution path. Keeping them separate is clearer and not meaningfully
 * slower for our data volumes.
 */
export async function fetchSummary(
  db: D1Database,
  urlId: number
): Promise<AnalyticsSummary> {
  const clicksRow = await db
    .prepare(
      `SELECT COUNT(*) as total, MAX(clicked_at) as last_click
       FROM url_clicks
       WHERE url_id = ?`
    )
    .bind(urlId)
    .first<{ total: number; last_click: string | null }>();

  const uniqueRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT visitor_hash) as unique_count
       FROM url_clicks
       WHERE url_id = ?`
    )
    .bind(urlId)
    .first<{ unique_count: number }>();

  return {
    totalClicks: clicksRow?.total ?? 0,
    uniqueVisitors: uniqueRow?.unique_count ?? 0,
    lastClickedAt: clicksRow?.last_click ?? null,
  };
}

/**
 * Fetches click data grouped by day for the last 30 days.
 *
 * Returns exactly 30 entries (one per day), even for days with zero clicks.
 * This is important for the chart — gaps in data should show as zero,
 * not as missing points.
 *
 * How it works:
 *   1. Query D1 for clicks grouped by date (only returns days with clicks)
 *   2. Build a lookup map from the results
 *   3. Generate all 30 days and fill in zeros for missing days
 *
 * The date() function in SQLite extracts just the date portion
 * from a datetime string: "2026-02-15 14:30:00" → "2026-02-15"
 */
export async function fetchTimeline(
  db: D1Database,
  urlId: number
): Promise<TimelineDay[]> {
  const thirtyDaysAgo = getDateNDaysAgo(30);

  /** Clicks per day */
  const clickRows = await db
    .prepare(
      `SELECT date(clicked_at) as click_date,
              COUNT(*) as clicks
       FROM url_clicks
       WHERE url_id = ?
         AND clicked_at >= ?
       GROUP BY click_date
       ORDER BY click_date ASC`
    )
    .bind(urlId, thirtyDaysAgo)
    .all<{ click_date: string; clicks: number }>();

  /** Unique visitors per day */
  const uniqueRows = await db
    .prepare(
      `SELECT date(clicked_at) as click_date,
              COUNT(DISTINCT visitor_hash) as unique_count
       FROM url_clicks
       WHERE url_id = ?
         AND clicked_at >= ?
       GROUP BY click_date
       ORDER BY click_date ASC`
    )
    .bind(urlId, thirtyDaysAgo)
    .all<{ click_date: string; unique_count: number }>();

  // Build lookup maps: "2026-02-15" → count
  const clicksByDate = new Map<string, number>();
  for (const row of clickRows.results ?? []) {
    clicksByDate.set(row.click_date, row.clicks);
  }

  const uniqueByDate = new Map<string, number>();
  for (const row of uniqueRows.results ?? []) {
    uniqueByDate.set(row.click_date, row.unique_count);
  }

  // Generate all 30 days, filling zeros for missing days
  const timeline: TimelineDay[] = [];

  for (let i = 29; i >= 0; i--) {
    const date = getDateNDaysAgo(i);

    timeline.push({
      date,
      clicks: clicksByDate.get(date) ?? 0,
      uniqueVisitors: uniqueByDate.get(date) ?? 0,
    });
  }

  return timeline;
}

/**
 * Fetches the top 5 referrer sources by click count.
 *
 * Referrer is stored as a hostname (e.g. "twitter.com") by the
 * cleanReferrer function in click-tracking.ts. NULL referrers
 * (direct visits, QR code scans, privacy-stripping browsers)
 * are grouped as "Direct / None".
 *
 * COALESCE(referrer, 'Direct / None') converts NULLs to a
 * displayable string so they participate in the GROUP BY.
 */
export async function fetchTopReferrers(
  db: D1Database,
  urlId: number
): Promise<ReferrerEntry[]> {
  /** First get total clicks for percentage calculation */
  const totalRow = await db
    .prepare("SELECT COUNT(*) as total FROM url_clicks WHERE url_id = ?")
    .bind(urlId)
    .first<{ total: number }>();

  const totalClicks = totalRow?.total ?? 0;

  if (totalClicks === 0) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT COALESCE(referrer, 'Direct / None') as source,
              COUNT(*) as clicks
       FROM url_clicks
       WHERE url_id = ?
       GROUP BY source
       ORDER BY clicks DESC
       LIMIT 5`
    )
    .bind(urlId)
    .all<{ source: string; clicks: number }>();

  return (rows.results ?? []).map((row) => ({
    source: row.source,
    clicks: row.clicks,
    percentage: Math.round((row.clicks / totalClicks) * 100),
  }));
}

/**
 * Fetches device type breakdown (mobile, desktop, tablet).
 * Paid tier feature.
 */
export async function fetchDeviceBreakdown(
  db: D1Database,
  urlId: number
): Promise<DeviceEntry[]> {
  const totalRow = await db
    .prepare("SELECT COUNT(*) as total FROM url_clicks WHERE url_id = ?")
    .bind(urlId)
    .first<{ total: number }>();

  const totalClicks = totalRow?.total ?? 0;

  if (totalClicks === 0) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT device_type, COUNT(*) as clicks
       FROM url_clicks
       WHERE url_id = ?
       GROUP BY device_type
       ORDER BY clicks DESC`
    )
    .bind(urlId)
    .all<{ device_type: string; clicks: number }>();

  return (rows.results ?? []).map((row) => ({
    device: row.device_type ?? "unknown",
    clicks: row.clicks,
    percentage: Math.round((row.clicks / totalClicks) * 100),
  }));
}

/**
 * Fetches top 5 countries by click count.
 * Paid tier feature.
 */
export async function fetchCountryBreakdown(
  db: D1Database,
  urlId: number
): Promise<CountryEntry[]> {
  const totalRow = await db
    .prepare("SELECT COUNT(*) as total FROM url_clicks WHERE url_id = ?")
    .bind(urlId)
    .first<{ total: number }>();

  const totalClicks = totalRow?.total ?? 0;

  if (totalClicks === 0) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT COALESCE(country, 'Unknown') as country_code,
              COUNT(*) as clicks
       FROM url_clicks
       WHERE url_id = ?
       GROUP BY country_code
       ORDER BY clicks DESC
       LIMIT 5`
    )
    .bind(urlId)
    .all<{ country_code: string; clicks: number }>();

  return (rows.results ?? []).map((row) => ({
    country: row.country_code,
    clicks: row.clicks,
    percentage: Math.round((row.clicks / totalClicks) * 100),
  }));
}

/**
 * Fetches click data grouped by day-of-week and hour for the heatmap.
 * Paid tier feature.
 *
 * SQLite's strftime gives us:
 *   %w = day of week (0 = Sunday, 6 = Saturday)
 *   %H = hour (00-23)
 *
 * We use the last 30 days of data to build the heatmap, which gives
 * a representative picture of when clicks happen without scanning
 * the entire history.
 */
export async function fetchActivityHeatmap(
  db: D1Database,
  urlId: number
): Promise<HeatmapCell[]> {
  const thirtyDaysAgo = getDateNDaysAgo(30);

  const rows = await db
    .prepare(
      `SELECT CAST(strftime('%w', clicked_at) AS INTEGER) as day_of_week,
              CAST(strftime('%H', clicked_at) AS INTEGER) as hour,
              COUNT(*) as clicks
       FROM url_clicks
       WHERE url_id = ?
         AND clicked_at >= ?
       GROUP BY day_of_week, hour
       ORDER BY day_of_week, hour`
    )
    .bind(urlId, thirtyDaysAgo)
    .all<{ day_of_week: number; hour: number; clicks: number }>();

  return (rows.results ?? []).map((row) => ({
    dayOfWeek: row.day_of_week,
    hour: row.hour,
    clicks: row.clicks,
  }));
}

/**
 * Fetches total clicks across ALL of a user's URLs.
 * Used on the dashboard summary.
 */
export async function fetchTotalClicksForUser(
  db: D1Database,
  userId: string
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as total
       FROM url_clicks
       WHERE url_id IN (SELECT id FROM urls WHERE user_id = ?)`
    )
    .bind(userId)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns an ISO date string for N days ago.
 * Example: getDateNDaysAgo(30) on Feb 15 → "2026-01-16"
 */
function getDateNDaysAgo(n: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);

  return date.toISOString().split("T")[0];
}