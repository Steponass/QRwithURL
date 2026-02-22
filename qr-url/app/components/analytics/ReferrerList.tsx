/**
 * ReferrerList component.
 *
 * Displays the top 5 traffic sources as a table with inline
 * percentage bars. This is more scannable than a pie chart
 * because you see both the exact number and the proportion.
 *
 * No chart library needed — the percentage bar is a simple
 * <div> with a dynamic width.
 *
 * Common referrers:
 *   - "twitter.com", "linkedin.com" → social media shares
 *   - "google.com" → search results
 *   - "Direct / None" → typed URL, QR code scan, or browser stripping referrer
 */

import type { ReferrerEntry } from "~/lib/analytics-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReferrerListProps {
  referrers: ReferrerEntry[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReferrerList({ referrers }: ReferrerListProps) {
  if (referrers.length === 0) {
    return (
      <section>
        <h3>Top Referrers</h3>
        <p>
          No referrer data yet
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3 style={{ marginBottom: "0.5rem" }}>Top Referrers</h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {referrers.map((entry) => (
          <ReferrerRow key={entry.source} entry={entry} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReferrerRow({ entry }: { entry: ReferrerEntry }) {
  return (
    <div>
      {/* --- Label row: source name + click count --- */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.125rem",
        }}
      >
        <span style={{ fontSize: "0.875rem" }}>{entry.source}</span>
        <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          {entry.clicks} ({entry.percentage}%)
        </span>
      </div>

      {/* --- Percentage bar --- */}
      <div
        style={{
          height: "6px",
          backgroundColor: "#f3f4f6",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${entry.percentage}%`,
            backgroundColor: "#3b82f6",
            borderRadius: "3px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
