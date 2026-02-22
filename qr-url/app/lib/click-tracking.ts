/**
 * click-tracking.ts
 *
 * Pure functions for processing click data from HTTP requests.
 * Used by the redirect worker to build a click record before
 * inserting it into D1.
 *
 * This file contains NO database calls. It only transforms raw
 * HTTP request data into structured click data. The actual INSERT
 * happens in the redirect worker via ctx.waitUntil().
 *
 * Separation rationale:
 *   - Testable: pure functions with predictable inputs/outputs
 *   - Reusable: Phase 7 analytics dashboard imports the types
 *   - Worker-safe: no dependencies on React or browser APIs
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A structured click record ready for D1 insertion.
 * Every field is a simple string (or null) — no complex objects.
 */
export interface ClickRecord {
  /** Foreign key to the urls table */
  urlId: number;
  /** Where the user came from. Null if the browser stripped the header. */
  referrer: string | null;
  /** ISO 3166-1 alpha-2 country code, e.g. "US", "DE", "JP" */
  country: string | null;
  /** "mobile", "desktop", or "tablet" */
  deviceType: string;
  /**
   * SHA-256 hash of (IP + date + salt).
   * Used to count unique visitors without storing the raw IP.
   * The daily rotation means the same person gets a different hash
   * each day, preventing long-term tracking.
   */
  visitorHash: string;
}

// ---------------------------------------------------------------------------
// Device type parsing
// ---------------------------------------------------------------------------

/**
 * Determines device type from the User-Agent header.
 *
 * Instead of pulling in a big UA parsing library (which adds latency
 * and bundle size to the redirect worker), we check for known keywords.
 *
 * The order matters:
 *   1. Check tablet FIRST — iPads include "Safari" and "Mobile" in
 *      some configurations, but "iPad" is unique to tablets.
 *   2. Check mobile — "Mobile", "Android", "iPhone" cover 95%+ of phones.
 *   3. Everything else is desktop — including bots and unknown UAs.
 *      This is an intentional simplification. Bots are a tiny percentage
 *      and treating them as "desktop" is a reasonable default.
 *
 * Accuracy: ~95%+ for real user traffic. Good enough for analytics
 * where exact precision isn't critical.
 */
export function parseDeviceType(userAgent: string | null): string {
  if (!userAgent) {
    return "desktop";
  }

  const ua = userAgent.toLowerCase();

  // Tablet patterns — check BEFORE mobile because some tablets
  // include "Mobile" in their UA string
  const isTablet =
    ua.includes("ipad") ||
    ua.includes("tablet") ||
    (ua.includes("android") && !ua.includes("mobile"));

  if (isTablet) {
    return "tablet";
  }

  // Mobile patterns
  const isMobile =
    ua.includes("mobile") ||
    ua.includes("iphone") ||
    (ua.includes("android") && ua.includes("mobile"));

  if (isMobile) {
    return "mobile";
  }

  return "desktop";
}

// ---------------------------------------------------------------------------
// Referrer cleaning
// ---------------------------------------------------------------------------

/**
 * Cleans and validates the Referer header value.
 *
 * Why clean it?
 *   - Browsers sometimes send empty strings instead of omitting the header
 *   - We only want the origin (e.g. "https://twitter.com"), not the full
 *     path, to avoid storing potentially sensitive URL paths
 *   - Invalid/malformed referrers should become null, not error
 *
 * We store just the hostname (e.g. "twitter.com") because:
 *   - It's what we display in the "Top Referrers" list
 *   - Full URLs waste storage and contain paths we don't need
 *   - Easier to group/aggregate in queries
 */
export function cleanReferrer(referrer: string | null): string | null {
  if (!referrer || referrer.trim() === "") {
    return null;
  }

  try {
    const url = new URL(referrer);
    return url.hostname;
  } catch {
    // Malformed URL — discard it
    return null;
  }
}

// ---------------------------------------------------------------------------
// Visitor hashing
// ---------------------------------------------------------------------------

/**
 * Creates a privacy-safe visitor hash from an IP address.
 *
 * The hash is: SHA-256(ip + ":" + YYYY-MM-DD + ":" + salt)
 *
 * Why this approach?
 *   - We need unique visitor counts, but storing raw IPs is a privacy risk
 *   - SHA-256 is a one-way function: you can't recover the IP from the hash
 *   - The daily date component means the same visitor gets a different hash
 *     each day. This lets us count "unique visitors today" without building
 *     a long-term profile of any individual.
 *   - The secret salt prevents rainbow table attacks. Without it, someone
 *     with the hash could try all ~4 billion IPv4 addresses to find a match.
 *     With the salt, they'd need to know the salt first.
 *
 * @param ip - The visitor's IP address (from CF-Connecting-IP header)
 * @param salt - A secret string stored in environment variables
 * @returns A hex-encoded SHA-256 hash string
 */
export async function hashVisitorIp(
  ip: string,
  salt: string
): Promise<string> {
  const today = new Date().toISOString().split("T")[0]; // "2026-02-15"
  const input = `${ip}:${today}:${salt}`;

  /**
   * crypto.subtle is the Web Crypto API — available in both browsers
   * and Cloudflare Workers. Unlike Node's crypto module, it's async
   * and returns ArrayBuffers instead of strings.
   */
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert the ArrayBuffer to a hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return hashHex;
}

// ---------------------------------------------------------------------------
// Country extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the visitor's country from Cloudflare's request metadata.
 *
 * Cloudflare automatically geo-locates every request and attaches
 * the result to `request.cf`. This data comes from Cloudflare's
 * network — it's based on the IP address and is generally accurate
 * at the country level.
 *
 * The `cf` object is Cloudflare-specific and only exists on requests
 * handled by Cloudflare Workers. In local development with wrangler,
 * it may be undefined or have placeholder values.
 *
 * @param request - The incoming Request object with Cloudflare metadata
 * @returns ISO 3166-1 alpha-2 country code (e.g. "US"), or null
 */
export function extractCountry(request: Request): string | null {
  /**
   * request.cf is typed as IncomingRequestCfProperties in Cloudflare's
   * type definitions. The `country` field is a string like "US" or "DE".
   *
   * We cast through `any` because the Request type in standard TypeScript
   * doesn't include the `cf` property — it's a Cloudflare-specific extension.
   */
  const cf = (request as any).cf as
    | { country?: string }
    | undefined;

  if (!cf || !cf.country) {
    return null;
  }

  return cf.country;
}