/**
 * UrlList component.
 *
 * Renders the user's URLs as a vertical list, or an empty state
 * with a prompt to create their first URL.
 *
 * Each item is rendered by UrlListItem, which handles its own
 * copy and delete interactions via useFetcher.
 */

import { Link } from "react-router";
import { UrlListItem } from "~/components/Url-list-item";
import type { UrlRecord } from "~/components/Url-list-item";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UrlListProps {
  urls: UrlRecord[];
  urlCount: number;
  maxUrls: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UrlList({ urls, urlCount, maxUrls }: UrlListProps) {
  return (
    <section style={{ marginTop: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Your URLs</h2>
        <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          {urlCount} of {maxUrls} used
        </span>
      </div>

      {urls.length === 0 ? (
        <UrlListEmpty />
      ) : (
        <ul>
          {urls.map((url) => (
            <UrlListItem key={url.id} url={url} />
          ))}
        </ul>
      )}

      {urlCount < maxUrls && (
        <Link
          to="/dashboard/create"
        >
          + Create new URL
        </Link>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function UrlListEmpty() {
  return (
    <div>
      <p>No URLs yet.</p>
      <Link
        to="/dashboard/create"
        style={{ color: "#2563eb", marginTop: "0.5rem", display: "inline-block" }}
      >
        Create your first short URL
      </Link>
    </div>
  );
}
