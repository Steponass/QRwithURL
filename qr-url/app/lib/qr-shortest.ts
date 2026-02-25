/**
 * qr-shortest.ts
 *
 * Logic for the "shortest URL" QR encoding option.
 * Server-side only — called from the QR generation route action.
 *
 * The scenario:
 *   User has a branded URL: step.yourdomain.com/my-page → https://example.com
 *   User wants a QR code that encodes the SHORTEST possible URL.
 *   The shortest format is: yourdomain.com/my-page (no subdomain).
 *
 * But yourdomain.com/my-page might not exist yet (the user only
 * created the branded version). So we need to auto-create it.
 *
 * The flow:
 *   1. The URL already IS short format → use it directly, nothing to create
 *   2. The URL is branded → check if a short-format URL exists with
 *      the same shortcode pointing to the same original_url
 *   3. If yes → use that existing short URL
 *   4. If the shortcode is taken globally by someone else → auto-generate
 *      a new 6-char shortcode for a new short URL
 *   5. If the shortcode is available → create a short URL with it
 *
 * In cases 4 and 5, a new URL row is inserted into D1. This counts
 * against the user's 10-URL limit.
 */

import { generateUniqueShortcode } from "~/lib/shortcode";

import { SITE_DOMAIN } from "~/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UrlRecord {
  id: number;
  shortcode: string;
  original_url: string;
  subdomain: string | null;
}

interface ShortestUrlResult {
  /** The URL to encode in the QR code */
  encodedUrl: string;
  /** Whether a new URL row was auto-created */
  autoCreated: boolean;
  /** Error message if something went wrong */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves the shortest possible URL for a given URL record.
 * May auto-create a short-format URL if one doesn't exist.
 *
 * @param db - D1 database binding
 * @param userId - Clerk user ID (owner of the URL)
 * @param urlRecord - The URL the user wants a QR code for
 * @param currentUrlCount - User's current URL count (for limit check)
 * @param maxUrls - Maximum URLs allowed (currently 10)
 * @returns The shortest URL to encode + whether a URL was auto-created
 */
export async function resolveShortestUrl(
  db: D1Database,
  userId: string,
  urlRecord: UrlRecord,
  currentUrlCount: number,
  maxUrls: number,
): Promise<ShortestUrlResult> {
  // Case 1: URL is already short format — just use it
  if (urlRecord.subdomain === null) {
    return {
      encodedUrl: `${SITE_DOMAIN}/${urlRecord.shortcode}`,
      autoCreated: false,
      error: null,
    };
  }

  // Case 2: URL is branded — check if a matching short URL exists
  const existingShortUrl = await db
    .prepare(
      `SELECT id, shortcode FROM urls
       WHERE subdomain IS NULL
         AND original_url = ?
         AND user_id = ?
       LIMIT 1`,
    )
    .bind(urlRecord.original_url, userId)
    .first<{ id: number; shortcode: string }>();

  // Case 3: Found an existing short URL for the same destination
  if (existingShortUrl) {
    return {
      encodedUrl: `${SITE_DOMAIN}/${existingShortUrl.shortcode}`,
      autoCreated: false,
      error: null,
    };
  }

  // Need to create a new short URL. Check URL limit first.
  if (currentUrlCount >= maxUrls) {
    return {
      encodedUrl: "",
      autoCreated: false,
      error: `You've reached the ${maxUrls}-URL limit. Delete a URL before auto-creating a short version.`,
    };
  }

  // Case 4 or 5: Try to use the same shortcode in short format.
  // Check if it's available globally (subdomain = NULL scope).
  const shortcodeGloballyTaken = await db
    .prepare(
      `SELECT 1 FROM urls
       WHERE COALESCE(subdomain, '') = ''
         AND shortcode = ?
       LIMIT 1`,
    )
    .bind(urlRecord.shortcode)
    .first();

  let newShortcode: string;

  if (shortcodeGloballyTaken) {
    // Case 4: Shortcode taken globally — generate a new one
    const generated = await generateUniqueShortcode(db, null);

    if (!generated) {
      return {
        encodedUrl: "",
        autoCreated: false,
        error: "Failed to generate a unique shortcode. Please try again.",
      };
    }

    newShortcode = generated;
  } else {
    // Case 5: Shortcode available — reuse the branded shortcode
    newShortcode = urlRecord.shortcode;
  }

  // Insert the new short-format URL
  // The limit pre-check above (currentUrlCount >= maxUrls) guards the
  // common case. This atomic INSERT guards against concurrent requests
  // both passing the pre-check before either insert completes.
  let insertResult: Awaited<ReturnType<D1PreparedStatement["run"]>>;

  try {
    insertResult = await db
      .prepare(
        `INSERT INTO urls (user_id, shortcode, original_url, subdomain)
       SELECT ?, ?, ?, NULL
       WHERE (SELECT COUNT(*) FROM urls WHERE user_id = ?) < ?`,
      )
      .bind(userId, newShortcode, urlRecord.original_url, userId, maxUrls)
      .run();
  } catch (error: unknown) {
    const isUniqueConstraintError =
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed");

    if (isUniqueConstraintError) {
      return {
        encodedUrl: "",
        autoCreated: false,
        error: "Shortcode conflict. Please try again.",
      };
    }

    throw error;
  }

  if (insertResult.meta.changes === 0) {
    return {
      encodedUrl: "",
      autoCreated: false,
      error: `You've reached the ${maxUrls}-URL limit. Delete a URL before auto-creating a short version.`,
    };
  }

  return {
    encodedUrl: `${SITE_DOMAIN}/${newShortcode}`,
    autoCreated: true,
    error: null,
  };
}