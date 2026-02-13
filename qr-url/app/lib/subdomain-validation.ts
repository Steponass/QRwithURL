/**
 * subdomain-validation.ts
 *
 * All subdomain validation rules live here. This file is pure logic —
 * no database calls, no UI, no framework imports. It can be used:
 *   - Server-side in route actions (for real enforcement)
 *   - Client-side in form components (for instant feedback)
 *
 * Why separate from the action?
 *   The action handles D1 queries and auth. This file handles
 *   "is this string a valid subdomain?" — a different concern.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Words that can't be used as subdomains because they conflict with
 * our infrastructure or could be confused with official pages.
 *
 * "admin" — could impersonate site administration
 * "api"   — reserved for API endpoints
 * "www"   — standard web prefix
 * "app"   — the frontend dashboard lives here
 * "mail"  — email infrastructure
 * "ftp"   — file transfer protocol
 * "blog"  — potential future feature
 * "help"  — potential future feature
 * "support" — potential future feature
 * "status"  — potential future feature (status page)
 */
const RESERVED_SUBDOMAINS = new Set([
  "admin",
  "api",
  "www",
  "app",
  "mail",
  "ftp",
  "blog",
  "help",
  "support",
  "status",
]);

const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

/**
 * Only lowercase letters, numbers, and hyphens.
 * Must start and end with a letter or number (no leading/trailing hyphens).
 *
 * Valid:   "step", "my-site", "cool123"
 * Invalid: "-step", "step-", "my--site", "My_Site", "step.site"
 */
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SubdomainValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validates a subdomain string against all format rules.
 * Does NOT check database uniqueness — that requires a D1 query
 * and belongs in the route action.
 *
 * @param subdomain - The raw user input (will be trimmed and lowercased)
 * @returns Validation result with error message if invalid
 */
export function validateSubdomainFormat(
  subdomain: string
): SubdomainValidationResult {
  const cleaned = subdomain.trim().toLowerCase();

  if (cleaned.length === 0) {
    return { isValid: false, error: "Subdomain is required." };
  }

  if (cleaned.length < MIN_LENGTH) {
    return {
      isValid: false,
      error: `Subdomain must be at least ${MIN_LENGTH} characters.`,
    };
  }

  if (cleaned.length > MAX_LENGTH) {
    return {
      isValid: false,
      error: `Subdomain must be ${MAX_LENGTH} characters or fewer.`,
    };
  }

  if (!SUBDOMAIN_PATTERN.test(cleaned)) {
    return {
      isValid: false,
      error:
        "Only lowercase letters, numbers, and hyphens allowed. Must start and end with a letter or number.",
    };
  }

  if (cleaned.includes("--")) {
    return {
      isValid: false,
      error: "Subdomain cannot contain consecutive hyphens.",
    };
  }

  if (RESERVED_SUBDOMAINS.has(cleaned)) {
    return {
      isValid: false,
      error: `"${cleaned}" is reserved and cannot be used.`,
    };
  }

  return { isValid: true, error: null };
}

/**
 * Cleans user input before validation or storage.
 * Trims whitespace and lowercases.
 */
export function cleanSubdomain(rawInput: string): string {
  return rawInput.trim().toLowerCase();
}
