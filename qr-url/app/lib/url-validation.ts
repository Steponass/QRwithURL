/**
 * url-validation.ts
 *
 * Validates URLs submitted by users for shortening.
 * Pure logic — no database, no framework imports.
 *
 * We only allow http and https URLs. No mailto:, ftp:, javascript:,
 * data:, or other schemes — those are either irrelevant for URL
 * shortening or dangerous (javascript: URLs can execute code).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const MAX_URL_LENGTH = 2048;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface UrlValidationResult {
  isValid: boolean;
  error: string | null;
  /** The normalized URL (trimmed). Only set when isValid is true. */
  normalizedUrl: string | null;
}

/**
 * Validates a user-provided URL for shortening.
 *
 * Checks:
 *   1. Not empty
 *   2. Not too long (2048 chars — browser/server practical limit)
 *   3. Valid URL format (parseable by the URL constructor)
 *   4. Uses http or https protocol
 *
 * We intentionally do NOT check if the URL is reachable. That would
 * slow down creation, and users might be shortening URLs to pages
 * that don't exist yet (e.g., a site they're about to launch).
 */
export function validateUrl(rawUrl: string): UrlValidationResult {
  const trimmed = rawUrl.trim();

  if (trimmed.length === 0) {
    return { isValid: false, error: "URL is required.", normalizedUrl: null };
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      isValid: false,
      error: `URL must be ${MAX_URL_LENGTH} characters or fewer.`,
      normalizedUrl: null,
    };
  }

  /**
   * Try to parse with the URL constructor. This handles:
   *   - Missing protocol → throws (we catch and suggest adding https://)
   *   - Invalid format → throws
   *   - Valid URL → returns parsed object
   */
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format. Make sure to include https://",
      normalizedUrl: null,
    };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      isValid: false,
      error: "Only http and https URLs are supported.",
      normalizedUrl: null,
    };
  }

  return { isValid: true, error: null, normalizedUrl: trimmed };
}
