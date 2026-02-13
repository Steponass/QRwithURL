/**
 * shortcode.ts
 *
 * Shortcode generation and validation logic.
 * Pure functions — no database calls, no framework imports.
 *
 * Two modes:
 *   1. Auto-generated: 6 random chars from a-zA-Z0-9
 *   2. Custom: user-provided, validated for format rules
 *
 * The actual uniqueness check happens in the route action,
 * because it requires a D1 query.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Characters used for auto-generated shortcodes.
 * 62 chars × 6 positions = 62^6 = 56.8 billion combinations.
 * At 10 URLs per user, collisions are astronomically unlikely,
 * but we still retry on collision just in case.
 */
const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const AUTO_LENGTH = 6;
const MAX_COLLISION_RETRIES = 5;

const MIN_CUSTOM_LENGTH = 3;
const MAX_CUSTOM_LENGTH = 30;

/**
 * Custom shortcodes: lowercase letters, numbers, and hyphens.
 * Must start and end with a letter or number.
 *
 * Valid:   "my-page", "cool123", "abc"
 * Invalid: "-page", "page-", "my--page", "My_Page"
 */
const CUSTOM_SHORTCODE_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Shortcodes that could conflict with app routes or common paths.
 * These are blocked for BOTH auto-generated and custom shortcodes.
 *
 * This mirrors the RESERVED_PATHS set in workers/redirect.ts.
 * If you add a new route, add it here too.
 */
const RESERVED_SHORTCODES = new Set([
  "login",
  "signup",
  "dashboard",
  "api",
  "assets",
  "favicon",
  "robots",
  "sitemap",
  "admin",
  "help",
  "support",
  "about",
  "terms",
  "privacy",
]);

// ---------------------------------------------------------------------------
// Auto-generation
// ---------------------------------------------------------------------------

/**
 * Generates a random 6-character shortcode.
 *
 * Uses crypto.getRandomValues for cryptographically secure randomness.
 * This is available in Cloudflare Workers, browsers, and Node.js 19+.
 *
 * Why not Math.random()?
 *   Math.random is not cryptographically secure. For shortcodes that
 *   act as access tokens to URLs, we want unpredictable values so
 *   nobody can guess them by brute-forcing the pattern.
 */
export function generateShortcode(): string {
  const randomBytes = new Uint8Array(AUTO_LENGTH);
  crypto.getRandomValues(randomBytes);

  let shortcode = "";

  for (let i = 0; i < AUTO_LENGTH; i++) {
    /**
     * Map each random byte (0-255) to a charset index (0-61).
     * Using modulo introduces a tiny bias (256 % 62 = 8), but
     * for 6-char shortcodes this is negligible. A rejection
     * sampling approach would be theoretically better but
     * overkill for our use case.
     */
    const index = randomBytes[i] % CHARSET.length;
    shortcode += CHARSET[index];
  }

  return shortcode;
}

/**
 * Generates a shortcode and checks for collisions against D1.
 * Retries up to MAX_COLLISION_RETRIES times.
 *
 * This is the one function that touches the database, because
 * collision checking is tightly coupled with generation — you
 * can't separate "generate" from "is it unique?" without
 * creating a race condition.
 *
 * @param db - D1 database binding
 * @param subdomain - null for short format, string for branded
 * @returns A unique shortcode, or null if all retries failed
 */
export async function generateUniqueShortcode(
  db: D1Database,
  subdomain: string | null
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const candidate = generateShortcode();

    const isCollision = await checkShortcodeExists(db, candidate, subdomain);

    if (!isCollision) {
      return candidate;
    }
  }

  // All retries exhausted. With 56B combinations this should
  // essentially never happen, but we handle it gracefully.
  return null;
}

// ---------------------------------------------------------------------------
// Custom shortcode validation
// ---------------------------------------------------------------------------

export interface ShortcodeValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validates a user-provided custom shortcode.
 * Does NOT check database uniqueness.
 */
export function validateCustomShortcode(
  shortcode: string
): ShortcodeValidationResult {
  const cleaned = shortcode.trim().toLowerCase();

  if (cleaned.length === 0) {
    return { isValid: false, error: "Shortcode is required." };
  }

  if (cleaned.length < MIN_CUSTOM_LENGTH) {
    return {
      isValid: false,
      error: `Shortcode must be at least ${MIN_CUSTOM_LENGTH} characters.`,
    };
  }

  if (cleaned.length > MAX_CUSTOM_LENGTH) {
    return {
      isValid: false,
      error: `Shortcode must be ${MAX_CUSTOM_LENGTH} characters or fewer.`,
    };
  }

  if (!CUSTOM_SHORTCODE_PATTERN.test(cleaned)) {
    return {
      isValid: false,
      error:
        "Only lowercase letters, numbers, and hyphens allowed. Must start and end with a letter or number.",
    };
  }

  if (cleaned.includes("--")) {
    return {
      isValid: false,
      error: "Shortcode cannot contain consecutive hyphens.",
    };
  }

  if (RESERVED_SHORTCODES.has(cleaned)) {
    return {
      isValid: false,
      error: `"${cleaned}" is reserved and cannot be used.`,
    };
  }

  return { isValid: true, error: null };
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a shortcode already exists in D1 for the given scope.
 *
 * Scope depends on URL format:
 *   - Short format (subdomain=null): globally unique
 *   - Branded format (subdomain="step"): unique within that subdomain
 *
 * Uses COALESCE to handle NULL subdomain comparison, matching
 * the unique index in schema.sql.
 */
async function checkShortcodeExists(
  db: D1Database,
  shortcode: string,
  subdomain: string | null
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM urls
       WHERE COALESCE(subdomain, '') = COALESCE(?, '')
         AND shortcode = ?
       LIMIT 1`
    )
    .bind(subdomain, shortcode)
    .first();

  return row !== null;
}
