/**
 * AnalyticsSummary component.
 *
 * Displays the "big numbers" at the top of the analytics page:
 *   - Total clicks (free tier)
 *   - Unique visitors (paid tier)
 *   - Last clicked timestamp (free tier)
 *
 * These are the first thing a user looks at — they answer
 * "is my link getting traffic?" at a glance.
 *
 */

import type { AnalyticsSummary as SummaryData } from "~/lib/analytics-queries";


interface AnalyticsSummaryProps {
  summary: SummaryData;
  /** Whether to show the unique visitors card (pro tier only) */
  showUniqueVisitors: boolean;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsSummary({ summary, showUniqueVisitors }: AnalyticsSummaryProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showUniqueVisitors ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      <StatCard
        label="Total Clicks"
        value={formatNumber(summary.totalClicks)}
      />
      {showUniqueVisitors && (
        <StatCard
          label="Unique Visitors"
          value={formatNumber(summary.uniqueVisitors)}
        />
      )}
      <StatCard
        label="Last Clicked"
        value={formatLastClicked(summary.lastClickedAt)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p>
        {label}
      </p>
      <p>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a number with comma separators.
 * 1234567 → "1,234,567"
 */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Formats the "last clicked" timestamp into a human-readable string.
 * Shows relative time for recent clicks, absolute date for older ones.
 */
function formatLastClicked(isoString: string | null): string {
  if (!isoString) {
    return "Never";
  }

  try {
    const date = new Date(isoString + "Z");
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}
