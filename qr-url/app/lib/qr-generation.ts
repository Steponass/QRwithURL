/**
 *
 * Client-side QR code generation using the `qrcode` npm package.
 * This file runs ONLY in the browser — it uses the browser's
 * native Canvas API via qrcode's toDataURL method.
 *
 * Why client-side?
 *   The `qrcode` package needs canvas to generate PNGs.
 *   Cloudflare Workers don't have canvas. Browsers do.
 *   So we generate in the browser, then send the base64 PNG
 *   to the server for R2 storage.
 *
 * The toDataURL output is a base64 data URI like:
 *   "data:image/png;base64,iVBORw0KGgoAAAAN..."
 *
 * For a 512px QR code this is roughly 5-15KB — well within
 * form submission limits.
 */

import QRCode from "qrcode";


export interface QrCustomization {
  /** Foreground (dark module) color. Hex with alpha: "#000000FF" */
  foregroundColor: string;
  /** Background (light module) color. Hex with alpha: "#FFFFFFFF" */
  backgroundColor: string;
  /** Image width in pixels: 256, 512, or 1024 */
  size: number;
  /** Error correction level: L (7%), M (15%), Q (25%), H (30%) */
  errorCorrection: "L" | "M" | "Q" | "H";
}

export const DEFAULT_CUSTOMIZATION: QrCustomization = {
  foregroundColor: "#000000FF",
  backgroundColor: "#FFFFFFFF",
  size: 512,
  errorCorrection: "M",
};

/** Available size options for the UI */
export const SIZE_OPTIONS = [
  { value: 256, label: "256px (small)" },
  { value: 512, label: "512px (medium)" },
  { value: 1024, label: "1024px (large)" },
] as const;

/** Available error correction levels for the UI */
export const ERROR_CORRECTION_OPTIONS = [
  { value: "L" as const, label: "Low (7%)" },
  { value: "M" as const, label: "Medium (15%)" },
  { value: "Q" as const, label: "Quartile (25%)" },
  { value: "H" as const, label: "High (30%)" },
] as const;


// Maximum allowed size for a generated QR code PNG.
// 1024px QR codes with H error correction are typically 30–80KB.
// 200KB gives plenty of headroom while blocking unreasonably large outputs.
export const MAX_QR_IMAGE_SIZE_BYTES = 200 * 1024;

/**
 * Generates a QR code as a base64 data URI (PNG format).
 */

export async function generateQrDataUrl(
  url: string,
  customization: QrCustomization
): Promise<string> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: customization.size,
    margin: 2,
    errorCorrectionLevel: customization.errorCorrection,
    color: {
      dark: customization.foregroundColor,
      light: customization.backgroundColor,
    },
  });

  // Base64 inflates binary size by ~33%, so we decode to get the
  // true byte count before checking against the limit.
  const approximateSizeBytes = dataUrlToBytes(dataUrl).length;

  if (approximateSizeBytes > MAX_QR_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Generated QR code is ${Math.round(approximateSizeBytes / 1024)}KB, which exceeds the 200KB limit.`
    );
  }

  return dataUrl;
}

/**
 * Converts a base64 data URI to a Uint8Array of PNG bytes.
 * Used when sending the image to the server for R2 upload.
 *
 * "data:image/png;base64,iVBOR..." → Uint8Array of raw PNG bytes
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}