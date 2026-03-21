/**
 *
 * Shows the client-generated QR code image with:
 *   - Visual preview at a fixed display size
 *   - Download button (direct browser download, no server needed)
 *   - Save button (submits to server for R2 storage + D1 metadata)
 *
 * The QR data URL is generated client-side by the parent page.
 * This component receives it as a prop and handles display + submission.
 */

import { useState } from "react";
import { useFetcher } from "react-router";

interface QrPreviewProps {
  /** Base64 data URI of the QR PNG */
  dataUrl: string;
  encodedUrl: string;
  urlType: string;
  /** Database ID of the source URL */
  urlId: number;
  customizationJson: string;
}


export function QrPreview({
  dataUrl,
  encodedUrl,
  urlType,
  urlId,
  customizationJson,
}: QrPreviewProps) {
  const fetcher = useFetcher();
  const [downloaded, setDownloaded] = useState(false);

  const isSaving = fetcher.state !== "idle";
  const saveSucceeded = fetcher.data?.success === true;
  const saveError = fetcher.data?.success === false ? fetcher.data?.error : null;

  function handleDownload() {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${urlType}-${urlId}.png`;
    link.click();
    setDownloaded(true);
  }

  function handleSave() {
    fetcher.submit(
      {
        intent: "save-qr",
        urlId: String(urlId),
        urlType,
        encodedUrl,
        customizationJson,
        imageDataUrl: dataUrl,
      },
      { method: "post" }
    );
  }

  return (
    <div>
      {/* --- QR Image --- */}
      <div>
        <img
          src={dataUrl}
          alt={`QR code for ${encodedUrl}`}
          style={{
            maxWidth: "192px",
            imageRendering: "pixelated",
          }}
        />
      </div>

      <p>
        Encodes: <code>{encodedUrl}</code>
      </p>

      {/* --- Actions --- */}
      <div>
        <button
          type="button"
          onClick={handleDownload}
        >
          {downloaded ? "Downloaded!" : "Download PNG"}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || saveSucceeded}
        >
          {isSaving ? "Saving..." : saveSucceeded ? "Saved!" : "Save to Library"}
        </button>
      </div>

      {/* --- Save feedback --- */}
      {saveSucceeded && (
        <p>
          QR code saved! You can find it on your dashboard.
        </p>
      )}

      {saveError && (
        <p role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}
