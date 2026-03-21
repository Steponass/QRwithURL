/**
 * QrListItem component.
 *
 * Renders a single QR code entry: thumbnail, encoded URL,
 * type badge, creation date, download link, and delete button.
 */

import { useState } from "react";
import { useFetcher } from "react-router";

export interface QrRecord {
  id: number;
  url_id: number;
  url_type: string;
  encoded_url: string;
  storage_path: string;
  customization: string;
  created_at: string;
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
// QrListItem
// ---------------------------------------------------------------------------

interface QrListItemProps {
  qrCode: QrRecord;
}

export function QrListItem({ qrCode }: QrListItemProps) {
  const typeLabel = URL_TYPE_LABELS[qrCode.url_type] ?? qrCode.url_type;
  const formattedDate = formatDate(qrCode.created_at);
  const imageUrl = `/api/qr-image/${qrCode.storage_path}`;

  return (
    <li className="QrListItem">
      {/* --- Thumbnail --- */}
      <img
        src={imageUrl}
        alt={`QR code for ${qrCode.encoded_url}`}
        style={{
          width: "64px",
          imageRendering: "pixelated",
        }}
      />

      {/* --- Details --- */}
      <div>
        <div>
          <code>{qrCode.encoded_url}</code>
        </div>
        <span>Created {formattedDate}</span>
        <span>{typeLabel}</span>
      </div>

      {/* --- Actions --- */}
      <div>
        <a href={imageUrl} download={`qr-${qrCode.url_type}-${qrCode.id}.png`}>
          Download
        </a>
        <QrDeleteButton qrId={qrCode.id} />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// QrDeleteButton
// ---------------------------------------------------------------------------

interface QrDeleteButtonProps {
  qrId: number;
}

export function QrDeleteButton({ qrId }: QrDeleteButtonProps) {
  const fetcher = useFetcher();
  const [showConfirm, setShowConfirm] = useState(false);

  const isDeleting = fetcher.state !== "idle";

  function handleConfirm() {
    fetcher.submit(
      { intent: "delete-qr", qrId: String(qrId) },
      { method: "post" },
    );
    setShowConfirm(false);
  }

  if (isDeleting) {
    return <span>Deleting...</span>;
  }

  if (showConfirm) {
    return (
      <div>
        <button type="button" onClick={handleConfirm}>
          Confirm
        </button>
        <button type="button" onClick={() => setShowConfirm(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowConfirm(true)}>
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
