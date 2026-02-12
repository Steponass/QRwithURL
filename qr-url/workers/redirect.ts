/**
 * redirect.ts
 *
 * Handles short URL redirects. This is the most performance-critical
 * code path in the entire app — every short URL visit runs through here.
 *
 * Flow:
 * 1. Parse the incoming URL to extract subdomain + shortcode
 * 2. Query D1 for a matching URL record
 * 3. Return a 302 redirect to the original URL
 *
 * If the request doesn't look like a redirect (e.g. it's a dashboard page,
 * a static asset, or there's no matching shortcode), we return null
 * so the main handler can pass it to React Router instead.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The result of parsing an incoming request URL.
 * Either we found something that looks like a short URL, or we didn't.
 */
interface ParsedShortUrl {
  shortcode: string;
  subdomain: string | null; // null = short format (yourdomain.com/code)
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Your root domain, without any subdomain.
 * Used to determine whether a request is on the root domain (short format)
 * or on a subdomain (branded format).
 *
 * Example: if ROOT_DOMAIN is "qrurl.dev"
 *   - "qrurl.dev/abc123"       → short format,   subdomain = null
 *   - "step.qrurl.dev/abc123"  → branded format,  subdomain = "step"
 *   - "app.qrurl.dev/anything" → reserved,        skip (let React Router handle)
 *
 * TODO: Move this to an environment variable in wrangler.jsonc
 *       once you've purchased your domain.
 */
const ROOT_DOMAIN = "localhost";

/**
 * Subdomains that should NOT be treated as user branded subdomains.
 * Requests to these subdomains get passed through to React Router.
 *
 * "app" — the frontend dashboard
 * "api" — future API endpoints
 * "www" — in case someone types www.yourdomain.com
 */
const RESERVED_SUBDOMAINS = new Set(["app", "api", "www"]);

/**
 * Path prefixes that should never be treated as shortcodes.
 * These are routes that React Router handles.
 *
 * Without this, a request to yourdomain.com/login would try to
 * look up "login" as a shortcode in D1 — which would fail but
 * waste a database query on every page navigation.
 */
const RESERVED_PATHS = new Set([
  "login",
  "signup",
  "dashboard",
  "api",
  "assets",
  "favicon.ico",
]);

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Attempts to handle a request as a short URL redirect.
 *
 * @returns A 302 Response if a matching shortcode was found, or null
 *          if this request should be handled by React Router instead.
 */
export async function handleRedirect(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | null> {
  // Only handle GET requests. POST/PUT/DELETE are never redirects.
  if (request.method !== "GET") {
    return null;
  }

  const parsed = parseShortUrl(request);

  if (!parsed) {
    return null;
  }

  const { shortcode, subdomain } = parsed;

  const originalUrl = await lookupUrl(env.qr_url_db, shortcode, subdomain);

  if (!originalUrl) {
    // Shortcode not found in database.
    // Return null so React Router can show a 404 page.
    return null;
  }

  // Success! Return an immediate 302 redirect.
  return Response.redirect(originalUrl, 302);
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Parses the request URL to extract a shortcode and optional subdomain.
 * Returns null if this doesn't look like a short URL request.
 *
 * Examples (assuming ROOT_DOMAIN = "qrurl.dev"):
 *   "https://qrurl.dev/abc123"        → { shortcode: "abc123", subdomain: null }
 *   "https://step.qrurl.dev/mysite"   → { shortcode: "mysite", subdomain: "step" }
 *   "https://qrurl.dev/dashboard"     → null (reserved path)
 *   "https://app.qrurl.dev/anything"  → null (reserved subdomain)
 *   "https://qrurl.dev/"              → null (no shortcode)
 */
function parseShortUrl(request: Request): ParsedShortUrl | null {
  const url = new URL(request.url);
  const hostname = url.hostname;

  // -------------------------------------------------------------------------
  // Step 1: Extract the shortcode from the path
  // -------------------------------------------------------------------------

  // Remove the leading "/" and get the first path segment.
  // "https://qrurl.dev/abc123/anything" → pathSegments = ["abc123", "anything"]
  // We only care about the first segment.
  const pathSegments = url.pathname.split("/").filter(Boolean);

  // No path = someone visited the root domain (yourdomain.com/).
  // That's the homepage, not a redirect.
  if (pathSegments.length === 0) {
    return null;
  }

  const shortcode = pathSegments[0];

  // If the path starts with a reserved word, it's a frontend route.
  if (RESERVED_PATHS.has(shortcode)) {
    return null;
  }

  // -------------------------------------------------------------------------
  // Step 2: Determine if this is a branded or short format URL
  // -------------------------------------------------------------------------

  const subdomain = extractSubdomain(hostname);

  // If it's a reserved subdomain like "app" or "api", let React Router handle it.
  if (subdomain && RESERVED_SUBDOMAINS.has(subdomain)) {
    return null;
  }

  return { shortcode, subdomain };
}

/**
 * Extracts the subdomain from a hostname.
 *
 * "step.qrurl.dev" → "step"
 * "qrurl.dev"      → null
 * "localhost"       → null
 *
 * For local development, there is no subdomain — localhost doesn't
 * support subdomains without extra hosts file configuration.
 * We'll handle branded URL testing differently (more on this later).
 */
function extractSubdomain(hostname: string): string | null {
  // Local development: no subdomain support
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return null;
  }

  // Split "step.qrurl.dev" into ["step", "qrurl", "dev"]
  const parts = hostname.split(".");

  // "qrurl.dev" has 2 parts → no subdomain
  // "step.qrurl.dev" has 3 parts → subdomain is "step"
  if (parts.length <= 2) {
    return null;
  }

  return parts[0];
}

// ---------------------------------------------------------------------------
// Database lookup
// ---------------------------------------------------------------------------

/**
 * Queries D1 for a URL matching the given shortcode and subdomain.
 *
 * The expiration check handles two cases:
 *   - expires_at IS NULL → link never expires (authenticated users)
 *   - expires_at > datetime('now') → link hasn't expired yet (anonymous users)
 *
 * If a URL has expired, we treat it as "not found" — same as if the
 * shortcode didn't exist. The caller returns null, and React Router
 * can show a 404 or "link expired" page.
 *
 * @returns The original URL string if found and not expired, or null.
 */
async function lookupUrl(
  db: D1Database,
  shortcode: string,
  subdomain: string | null
): Promise<string | null> {
  let result;

  if (subdomain === null) {
    result = await db
      .prepare(
        `SELECT original_url FROM urls
         WHERE subdomain IS NULL
           AND shortcode = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .bind(shortcode)
      .first<{ original_url: string }>();
  } else {
    result = await db
      .prepare(
        `SELECT original_url FROM urls
         WHERE subdomain = ?
           AND shortcode = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .bind(subdomain, shortcode)
      .first<{ original_url: string }>();
  }

  if (!result) {
    return null;
  }

  return result.original_url;
}