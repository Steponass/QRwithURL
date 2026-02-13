/**
 * rate-limit.ts
 *
 * Per-IP daily rate limiting for anonymous URL creation.
 * Uses Cloudflare Workers KV for storage.
 *
 * Why KV instead of D1?
 *   KV supports automatic TTL (time-to-live) on keys. We set each
 *   key to expire at the end of the day (UTC). When the TTL hits,
 *   the key disappears automatically — no cleanup job needed.
 *   D1 doesn't have TTL, so we'd need to manually query and prune
 *   expired records.
 *
 * Key format: "ratelimit:{ip}:{YYYY-MM-DD}"
 *   Example:   "ratelimit:203.0.113.45:2026-02-13"
 *   Value:     "3" (number of URLs created today)
 *   TTL:       Expires at end of day + buffer
 *
 * Why include the date in the key?
 *   KV TTLs are approximate (can be delayed by up to 60 seconds).
 *   Including the date ensures that even if a key lingers past
 *   midnight, a new day gets a fresh key. The TTL is just cleanup.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ANONYMOUS_URLS_PER_DAY = 5;

/** Key prefix to namespace our rate limit entries in KV. */
const KEY_PREFIX = "ratelimit";

/**
 * TTL for rate limit keys in seconds.
 * 24 hours + 1 hour buffer to account for KV's approximate TTL.
 * The date in the key handles the actual day boundary — TTL is
 * just for automatic garbage collection.
 */
const TTL_SECONDS = 25 * 60 * 60; // 25 hours

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks whether an IP address has remaining anonymous URL creation
 * quota for today.
 *
 * Does NOT increment the counter — call incrementRateLimit() after
 * successfully creating the URL. This separation matters because
 * we don't want to count a failed creation attempt against the limit.
 *
 * @param kv - Workers KV namespace binding
 * @param clientIp - The client's IP address
 * @returns Whether the request is allowed and how many uses remain
 */
export async function checkRateLimit(
  kv: KVNamespace,
  clientIp: string
): Promise<RateLimitResult> {
  const key = buildKey(clientIp);

  const currentCountRaw = await kv.get(key);
  const currentCount = currentCountRaw ? parseInt(currentCountRaw, 10) : 0;

  if (currentCount >= MAX_ANONYMOUS_URLS_PER_DAY) {
    return {
      allowed: false,
      remaining: 0,
      error: `Daily limit reached (${MAX_ANONYMOUS_URLS_PER_DAY} URLs per day). Sign up for a free account to get 10 permanent URLs.`,
    };
  }

  return {
    allowed: true,
    remaining: MAX_ANONYMOUS_URLS_PER_DAY - currentCount,
    error: null,
  };
}

/**
 * Increments the rate limit counter for an IP address.
 * Call this AFTER a successful URL creation.
 *
 * @param kv - Workers KV namespace binding
 * @param clientIp - The client's IP address
 * @returns The new remaining count
 */
export async function incrementRateLimit(
  kv: KVNamespace,
  clientIp: string
): Promise<number> {
  const key = buildKey(clientIp);

  const currentCountRaw = await kv.get(key);
  const currentCount = currentCountRaw ? parseInt(currentCountRaw, 10) : 0;
  const newCount = currentCount + 1;

  await kv.put(key, String(newCount), { expirationTtl: TTL_SECONDS });

  return MAX_ANONYMOUS_URLS_PER_DAY - newCount;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the KV key for a given IP and today's date.
 * Uses UTC date to avoid timezone ambiguity.
 */
function buildKey(clientIp: string): string {
  const today = new Date().toISOString().split("T")[0]; // "2026-02-13"
  return `${KEY_PREFIX}:${clientIp}:${today}`;
}

/**
 * Extracts the client IP from a Cloudflare Worker request.
 *
 * CF-Connecting-IP is set by Cloudflare on every request that
 * goes through their network. In local development (wrangler dev),
 * this header won't be present, so we fall back to "127.0.0.1".
 *
 * Why not X-Forwarded-For?
 *   X-Forwarded-For can be spoofed by the client. CF-Connecting-IP
 *   is set by Cloudflare's edge and cannot be forged.
 */
export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "127.0.0.1";
}