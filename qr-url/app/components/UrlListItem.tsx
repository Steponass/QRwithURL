/**
 *
 * Displays a single URL entry with:
 *   - Original URL (truncated if long)
 *   - Full short/branded URL (clickable + copy button)
 *   - Format badge (short vs branded)
 *   - Creation date
 *   - Delete button with confirmation
 *
 * Uses useFetcher for deletion so it doesn't navigate away from
 * the dashboard. The dashboard loader re-runs after the fetcher
 * completes, removing the deleted item from the list.
 */

import { useState } from "react";
import { useFetcher, Link } from "react-router";

/**
 * The URL data shape as it comes from the dashboard loader.
 * Matches the SELECT columns in the loader query.
 */
export interface UrlRecord {
  id: number;
  shortcode: string;
  original_url: string;
  subdomain: string | null;
  created_at: string;
}


/** TODO: Replace with your actual domain once purchased. */
import { SITE_DOMAIN } from "~/lib/constants";

const DISPLAY_DOMAIN = SITE_DOMAIN;

/** Truncate original URLs longer than this for display. */
const MAX_DISPLAY_URL_LENGTH = 50;


export function UrlListItem({ url }: { url: UrlRecord }) {
  const fullShortUrl = buildShortUrl(url.shortcode, url.subdomain);
  const truncatedOriginal = truncateUrl(url.original_url);
  const formattedDate = formatDate(url.created_at);
  const formatLabel = url.subdomain ? "branded" : "short";

  return (
    <li>
      {/* --- Short URL + Copy --- */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <code style={{ fontSize: "1rem" }}>{fullShortUrl}</code>
        <CopyButton text={fullShortUrl} />
        <span>
          {formatLabel}
        </span>
      </div>

      {/* --- Original URL --- */}
      <p
        title={url.original_url}
      >
        {truncatedOriginal}
      </p>

      {/* --- Footer: date + actions --- */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "0.5rem",
        }}
      >
        <span>
          Created {formattedDate}
        </span>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link
            to={`/dashboard/analytics/${url.id}`}
            style={{ fontSize: "0.75rem", color: "#2563eb" }}
          >
            Analytics
          </Link>
          <Link
            to={`/dashboard/qr/new?urlId=${url.id}`}
          >
            QR
          </Link>
          <DeleteButton urlId={url.id} shortcode={url.shortcode} />
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function DeleteButton({
  urlId,
  shortcode,
}: {
  urlId: number;
  shortcode: string;
}) {
  const fetcher = useFetcher();
  const [showConfirm, setShowConfirm] = useState(false);

  const isDeleting = fetcher.state !== "idle";

  function handleDeleteClick() {
    setShowConfirm(true);
  }

  function handleCancel() {
    setShowConfirm(false);
  }

  function handleConfirm() {
    fetcher.submit(
      { intent: "delete-url", urlId: String(urlId) },
      { method: "post" }
    );
    setShowConfirm(false);
  }

  if (isDeleting) {
    return (
      <span>
        Deleting...
      </span>
    );
  }

  if (showConfirm) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span>
          Delete "{shortcode}"? The shortcode becomes available to others.
        </span>
        <button
          type="button"
          onClick={handleConfirm}
        >
          Yes, delete
        </button>
        <button
          type="button"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDeleteClick}
    >
      Delete
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildShortUrl(
  shortcode: string,
  subdomain: string | null
): string {
  if (subdomain) {
    return `${subdomain}.${DISPLAY_DOMAIN}/${shortcode}`;
  }

  return `${DISPLAY_DOMAIN}/${shortcode}`;
}

function truncateUrl(url: string): string {
  if (url.length <= MAX_DISPLAY_URL_LENGTH) {
    return url;
  }

  return url.substring(0, MAX_DISPLAY_URL_LENGTH) + "...";
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString + "Z");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}