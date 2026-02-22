/**
 *
 * Displays the user's saved QR codes on the dashboard.
 * Each item shows a thumbnail, the encoded URL, URL type,
 * creation date, and a delete button.
 *
 * QR images are served via /api/qr-image/{storagePath} which
 * reads from R2 (handled by a route we'll add).
 */

import { useState } from "react";
import { Link, useFetcher } from "react-router";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QrRecord {
  id: number;
  url_id: number;
  url_type: string;
  encoded_url: string;
  storage_path: string;
  customization: string;
  created_at: string;
}

interface QrListProps {
  qrCodes: QrRecord[];
  qrCount: number;
  maxQrCodes: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const URL_TYPE_LABELS: Record<string, string> = {
  original: "Original",
  branded: "Branded",
  shortest: "Shortest",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QrList({ qrCodes, qrCount, maxQrCodes }: QrListProps) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Your QR Codes</h2>
        <span>
          {qrCount} of {maxQrCodes} used
        </span>
      </div>

      {qrCodes.length === 0 ? (
        <QrListEmpty />
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "1rem 0",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {qrCodes.map((qr) => (
            <QrListItem key={qr.id} qrCode={qr} />
          ))}
        </ul>
      )}

      {qrCount < maxQrCodes && (
        <Link
          to="/dashboard/qr/new"
          style={{
            display: "inline-block",
            marginTop: "0.5rem",
            color: "#2563eb",
          }}
        >
          + Generate new QR code
        </Link>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QrListEmpty() {
  return (
    <div>
      <p>No QR codes yet.</p>
      <Link
        to="/dashboard/qr/new"
        style={{
          color: "#2563eb",
          marginTop: "0.5rem",
          display: "inline-block",
        }}
      >
        Generate your first QR code
      </Link>
    </div>
  );
}

function QrListItem({ qrCode }: { qrCode: QrRecord }) {
  const typeLabel = URL_TYPE_LABELS[qrCode.url_type] ?? qrCode.url_type;
  const formattedDate = formatDate(qrCode.created_at);
  const imageUrl = `/api/qr-image/${qrCode.storage_path}`;

  return (
    <li>
      {/* --- Thumbnail --- */}
      <img
        src={imageUrl}
        alt={`QR code for ${qrCode.encoded_url}`}
        style={{
          width: "64px",
          height: "64px",
          imageRendering: "pixelated",
          border: "1px solid #e5e7eb",
          borderRadius: "4px",
        }}
      />

      {/* --- Details --- */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <code
            style={{
              fontSize: "0.875rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {qrCode.encoded_url}
          </code>
          <span
            style={{
              padding: "0.125rem 0.5rem",
              flexShrink: 0,
            }}
          >
            {typeLabel}
          </span>
        </div>
        <span>
          Created {formattedDate}
        </span>
      </div>

      {/* --- Actions --- */}
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <a
          href={imageUrl}
          download={`qr-${qrCode.url_type}-${qrCode.id}.png`}
        >
          Download
        </a>
        <QrDeleteButton qrId={qrCode.id} />
      </div>
    </li>
  );
}

function QrDeleteButton({ qrId }: { qrId: number }) {
  const fetcher = useFetcher();
  const [showConfirm, setShowConfirm] = useState(false);

  const isDeleting = fetcher.state !== "idle";

  function handleConfirm() {
    fetcher.submit(
      { intent: "delete-qr", qrId: String(qrId) },
      { method: "post" }
    );
    setShowConfirm(false);
  }

  if (isDeleting) {
    return (
      <span>Deleting...</span>
    );
  }

  if (showConfirm) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          type="button"
          onClick={handleConfirm}
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
    >
      Delete
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
