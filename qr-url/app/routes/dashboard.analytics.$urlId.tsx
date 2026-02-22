/**
 * dashboard.analytics.$urlId.tsx — /dashboard/analytics/:urlId
 *
 * Per-URL analytics page with tier gating.
 *
 * Free tier sees: summary stats (total clicks + last clicked),
 *   30-day timeline, top 5 referrers
 *
 * Pro tier sees: all of the above PLUS unique visitors, device
 *   breakdown, country breakdown, activity heatmap
 *
 * The loader checks the user's plan and skips queries for features
 * the user can't see. This saves ~3 D1 queries per page load for
 * free users (devices, countries, heatmap).
 */

import { getAuth } from "@clerk/react-router/ssr.server";
import { RedirectToSignIn } from "@clerk/react-router";
import { data, Link } from "react-router";
import type { Route } from "./+types/dashboard.analytics.$urlId";
import {
  fetchUrlInfo,
  fetchSummary,
  fetchTimeline,
  fetchTopReferrers,
  fetchDeviceBreakdown,
  fetchCountryBreakdown,
  fetchActivityHeatmap,
} from "~/lib/analytics-queries";
import type {
  UrlInfo,
  AnalyticsSummary as SummaryData,
  TimelineDay,
  ReferrerEntry,
  DeviceEntry,
  CountryEntry,
  HeatmapCell,
} from "~/lib/analytics-queries";
import { getTierPermissions } from "~/lib/tier";
import type { TierPermissions } from "~/lib/tier";
import { SITE_DOMAIN } from "~/lib/constants";
import { AnalyticsSummary } from "~/components/analytics/AnalyticsSummary";
import { ClickTimelineChart } from "~/components/analytics/ClickTimelineChart";
import { ReferrerList } from "~/components/analytics/ReferrerList";
import { DeviceBreakdownChart } from "~/components/analytics/DeviceBreakdownChart";
import { CountryBreakdownChart } from "~/components/analytics/CountryBreakdownChart";
import { ActivityHeatmapChart } from "~/components/analytics/ActivityHeatmapChart";
import { UpgradePrompt } from "~/components/UpgradePrompt";

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return {
      authenticated: false as const,
      urlInfo: null,
      summary: null,
      timeline: [] as TimelineDay[],
      referrers: [] as ReferrerEntry[],
      devices: [] as DeviceEntry[],
      countries: [] as CountryEntry[],
      heatmap: [] as HeatmapCell[],
      permissions: getTierPermissions("free"),
    };
  }

  const db = args.context.cloudflare.env.qr_url_db;
  const urlId = Number(args.params.urlId);

  if (isNaN(urlId)) {
    throw data({ error: "Invalid URL ID" }, { status: 400 });
  }

  // --- Fetch user's plan and URL info in parallel ---
  const [urlInfo, userRow] = await Promise.all([
    fetchUrlInfo(db, urlId, userId),
    db
      .prepare("SELECT plan FROM users WHERE clerk_user_id = ?")
      .bind(userId)
      .first<{ plan: string }>(),
  ]);

  if (!urlInfo) {
    throw data({ error: "URL not found" }, { status: 404 });
  }

  const permissions = getTierPermissions(userRow?.plan);

  /**
   * Build the list of queries to run based on the user's tier.
   *
   * Free users get: summary, timeline, referrers (3 queries)
   * Pro users get: all 6 queries
   *
   * We always run the core queries. Paid-tier queries are only
   * added if the user has permission, saving ~15ms of D1 time
   * per page load for free users.
   */
  const coreQueries = Promise.all([
    fetchSummary(db, urlId),
    fetchTimeline(db, urlId),
    fetchTopReferrers(db, urlId),
  ]);

  const shouldFetchPaid =
    permissions.hasDeviceBreakdown ||
    permissions.hasCountryBreakdown ||
    permissions.hasActivityHeatmap;

  const paidQueries: Promise<[DeviceEntry[], CountryEntry[], HeatmapCell[]]> = shouldFetchPaid
    ? Promise.all([
        fetchDeviceBreakdown(db, urlId),
        fetchCountryBreakdown(db, urlId),
        fetchActivityHeatmap(db, urlId),
      ])
    : Promise.resolve<[DeviceEntry[], CountryEntry[], HeatmapCell[]]>([[], [], []]);

  const [[summary, timeline, referrers], [devices, countries, heatmap]] =
    await Promise.all([coreQueries, paidQueries]);

  return {
    authenticated: true as const,
    urlInfo,
    summary,
    timeline,
    referrers,
    devices,
    countries,
    heatmap,
    permissions,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardAnalytics({
  loaderData,
}: Route.ComponentProps) {
  if (!loaderData.authenticated) {
    return <RedirectToSignIn />;
  }

  const {
    urlInfo,
    summary,
    timeline,
    referrers,
    devices,
    countries,
    heatmap,
    permissions,
  } = loaderData;

  if (!urlInfo || !summary) {
    return <p>URL not found.</p>;
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "800px" }}>
      <Link to="/dashboard" style={{ color: "#2563eb" }}>
        &larr; Back to Dashboard
      </Link>

      <UrlHeader urlInfo={urlInfo} />

      {/* --- Summary stats --- */}
      <AnalyticsSummary
        summary={summary}
        showUniqueVisitors={permissions.hasUniqueVisitors}
      />

      {/* --- Click timeline --- */}
      <ClickTimelineChart
        timeline={timeline}
        showUniqueOverlay={permissions.hasTimelineUniqueOverlay}
      />

      {/* --- Row 1: Referrers + Devices --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <ReferrerList referrers={referrers} />

        {permissions.hasDeviceBreakdown ? (
          <DeviceBreakdownChart devices={devices} />
        ) : (
          <UpgradePrompt
            featureTitle="Devices"
            description="See which devices your visitors use — mobile, desktop, or tablet."
          />
        )}
      </div>

      {/* --- Row 2: Countries + Heatmap --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        {permissions.hasCountryBreakdown ? (
          <CountryBreakdownChart countries={countries} />
        ) : (
          <UpgradePrompt
            featureTitle="Countries"
            description="See where your visitors are located around the world."
          />
        )}

        {permissions.hasActivityHeatmap ? (
          <ActivityHeatmapChart heatmapData={heatmap} />
        ) : (
          <UpgradePrompt
            featureTitle="Activity Heatmap"
            description="Discover when your links get the most clicks — by day and hour."
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UrlHeader({ urlInfo }: { urlInfo: UrlInfo }) {
  const shortUrl = urlInfo.subdomain
    ? `${urlInfo.subdomain}.${SITE_DOMAIN}/${urlInfo.shortcode}`
    : `${SITE_DOMAIN}/${urlInfo.shortcode}`;

  return (
    <div style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Analytics</h1>
      <p style={{ fontSize: "1.125rem" }}>
        <code>{shortUrl}</code>
      </p>
      <p
        style={{
          fontSize: "0.875rem",
          color: "#6b7280",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        → {urlInfo.originalUrl}
      </p>
    </div>
  );
}