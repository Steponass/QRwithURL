/**
 *
 * Collects all the settings needed to generate a QR code:
 *   - Which URL to encode
 *   - URL type (original / branded / shortest)
 *   - Foreground and background colors
 *   - Size (256 / 512 / 1024 px)
 *   - Error correction level (L / M / Q / H)
 *
 * When the user clicks "Generate Preview", the parent component
 * receives the settings via onGenerate callback and generates
 * the QR client-side. This component doesn't do the generation
 * itself — it's purely a settings form.
 */

import { useState } from "react";
import type { QrCustomization } from "~/lib/qr-generation";
import {
  DEFAULT_CUSTOMIZATION,
  SIZE_OPTIONS,
  ERROR_CORRECTION_OPTIONS,
} from "~/lib/qr-generation";


export interface UrlOption {
  id: number;
  shortcode: string;
  originalUrl: string;
  subdomain: string | null;
}

interface QrCustomizationFormProps {
  urls: UrlOption[];
  /** Pre-selected URL id from query param, or null */
  preselectedUrlId: number | null;
  onGenerate: (urlId: number, urlType: string, customization: QrCustomization) => void;
  isGenerating: boolean;
}

import { SITE_DOMAIN } from "~/lib/constants";

const DISPLAY_DOMAIN = SITE_DOMAIN;


export function QrCustomizationForm({
  urls,
  preselectedUrlId,
  onGenerate,
  isGenerating,
}: QrCustomizationFormProps) {
  const [selectedUrlId, setSelectedUrlId] = useState<number>(
    preselectedUrlId ?? (urls.length > 0 ? urls[0].id : 0)
  );
  const [urlType, setUrlType] = useState<string>("shortest");
  const [foregroundColor, setForegroundColor] = useState(
    DEFAULT_CUSTOMIZATION.foregroundColor.slice(0, 7) // Strip alpha for color input
  );
  const [backgroundColor, setBackgroundColor] = useState(
    DEFAULT_CUSTOMIZATION.backgroundColor.slice(0, 7)
  );
  const [size, setSize] = useState(DEFAULT_CUSTOMIZATION.size);
  const [errorCorrection, setErrorCorrection] = useState(
    DEFAULT_CUSTOMIZATION.errorCorrection
  );

  const selectedUrl = urls.find((u) => u.id === selectedUrlId);
  const hasBranded = selectedUrl?.subdomain !== null;

  function handleGenerate() {
    if (!selectedUrl) return;

    const customization: QrCustomization = {
      foregroundColor: foregroundColor + "FF", // Add full alpha
      backgroundColor: backgroundColor + "FF",
      size,
      errorCorrection,
    };

    onGenerate(selectedUrlId, urlType, customization);
  }

  if (urls.length === 0) {
    return (
      <div>
        <p>You need to create a URL before generating a QR code.</p>
      </div>
    );
  }

  return (
    <div>
      {/* --- URL Selector --- */}
      <UrlSelector
        urls={urls}
        selectedUrlId={selectedUrlId}
        onSelect={setSelectedUrlId}
      />

      {/* --- URL Type --- */}
      <UrlTypeSelector
        selectedType={urlType}
        onTypeChange={setUrlType}
        hasBranded={hasBranded}
        selectedUrl={selectedUrl ?? null}
      />

      {/* --- Colors --- */}
      <ColorPickers
        foreground={foregroundColor}
        background={backgroundColor}
        onForegroundChange={setForegroundColor}
        onBackgroundChange={setBackgroundColor}
      />

      {/* --- Size --- */}
      <SizeSelector selectedSize={size} onSizeChange={setSize} />

      {/* --- Error Correction --- */}
      <ErrorCorrectionSelector
        selectedLevel={errorCorrection}
        onLevelChange={setErrorCorrection}
      />

      {/* --- Generate Button --- */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating || !selectedUrl}
        style={{ cursor: "pointer", padding: "0.5rem 1rem", alignSelf: "flex-start" }}
      >
        {isGenerating ? "Generating..." : "Generate Preview"}
      </button>
    </div>
  );
}

// -----------------------------------------------
// Sub-components
// -----------------------------------------------

function UrlSelector({
  urls,
  selectedUrlId,
  onSelect,
}: {
  urls: UrlOption[];
  selectedUrlId: number;
  onSelect: (id: number) => void;
}) {
  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    onSelect(Number(event.target.value));
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <span style={{ fontWeight: "bold" }}>Select URL</span>
      <select
        value={selectedUrlId}
        onChange={handleChange}
        style={{ padding: "0.5rem", fontSize: "1rem" }}
      >
        {urls.map((url) => (
          <option key={url.id} value={url.id}>
            {buildDisplayUrl(url.shortcode, url.subdomain)} → {truncate(url.originalUrl, 40)}
          </option>
        ))}
      </select>
    </label>
  );
}

function UrlTypeSelector({
  selectedType,
  onTypeChange,
  hasBranded,
  selectedUrl,
}: {
  selectedType: string;
  onTypeChange: (type: string) => void;
  hasBranded: boolean;
  selectedUrl: UrlOption | null;
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onTypeChange(event.target.value);
  }

  return (
    <fieldset>
      <legend>
        URL to encode in QR
      </legend>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="radio"
            name="urlType"
            value="original"
            checked={selectedType === "original"}
            onChange={handleChange}
          />
          <span>
            Original URL
            <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>
              {" "}— direct link, not tracked
            </span>
          </span>
        </label>

        <label>
          <input
            type="radio"
            name="urlType"
            value="branded"
            checked={selectedType === "branded"}
            onChange={handleChange}
            disabled={!hasBranded}
          />
          <span>
            Branded URL
            {hasBranded && selectedUrl ? (
              <span>
                {" "}— {selectedUrl.subdomain}.{DISPLAY_DOMAIN}/{selectedUrl.shortcode}
              </span>
            ) : (
              <span>
                {" "}— only for branded URLs
              </span>
            )}
          </span>
        </label>

        <label>
          <input
            type="radio"
            name="urlType"
            value="shortest"
            checked={selectedType === "shortest"}
            onChange={handleChange}
          />
          <span>
            Shortest URL
            <span>
              {" "}— {DISPLAY_DOMAIN}/{selectedUrl?.shortcode ?? "..."}, best for QR
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

function ColorPickers({
  foreground,
  background,
  onForegroundChange,
  onBackgroundChange,
}: {
  foreground: string;
  background: string;
  onForegroundChange: (color: string) => void;
  onBackgroundChange: (color: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "1.5rem" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Foreground</span>
        <input
          type="color"
          value={foreground}
          onChange={(e) => onForegroundChange(e.target.value)}
          style={{ width: "60px", height: "36px", cursor: "pointer" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span style={{ fontWeight: "bold" }}>Background</span>
        <input
          type="color"
          value={background}
          onChange={(e) => onBackgroundChange(e.target.value)}
          style={{ width: "60px", height: "36px", cursor: "pointer" }}
        />
      </label>
    </div>
  );
}

function SizeSelector({
  selectedSize,
  onSizeChange,
}: {
  selectedSize: number;
  onSizeChange: (size: number) => void;
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onSizeChange(Number(event.target.value));
  }

  return (
    <fieldset>
      <legend>Size</legend>
      <div style={{ display: "flex", gap: "1rem" }}>
        {SIZE_OPTIONS.map((option) => (
          <label
            key={option.value}
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <input
              type="radio"
              name="size"
              value={option.value}
              checked={selectedSize === option.value}
              onChange={handleChange}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ErrorCorrectionSelector({
  selectedLevel,
  onLevelChange,
}: {
  selectedLevel: string;
  onLevelChange: (level: "L" | "M" | "Q" | "H") => void;
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onLevelChange(event.target.value as "L" | "M" | "Q" | "H");
  }

  return (
    <fieldset>
      <legend>
        Error Correction
      </legend>
      <div style={{ display: "flex", gap: "1rem" }}>
        {ERROR_CORRECTION_OPTIONS.map((option) => (
          <label
            key={option.value}
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <input
              type="radio"
              name="errorCorrection"
              value={option.value}
              checked={selectedLevel === option.value}
              onChange={handleChange}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDisplayUrl(shortcode: string, subdomain: string | null): string {
  if (subdomain) {
    return `${subdomain}.${DISPLAY_DOMAIN}/${shortcode}`;
  }
  return `${DISPLAY_DOMAIN}/${shortcode}`;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
}