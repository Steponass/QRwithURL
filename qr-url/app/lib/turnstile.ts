/**
 * turnstile.ts
 *
 * Server-side verification of Cloudflare Turnstile tokens.
 *
 * How Turnstile works:
 *   1. Client renders the Turnstile widget (invisible or managed)
 *   2. Widget produces a one-time token when user passes the challenge
 *   3. Token is submitted with the form as "cf-turnstile-response"
 *   4. Server sends token + secret key to Cloudflare's siteverify API
 *   5. Cloudflare returns { success: true/false }
 *
 * Tokens expire after 5 minutes and can only be validated once.
 * If validation fails, the client must re-render the widget for
 * a fresh token.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The response from Cloudflare's siteverify API.
 * We only use the fields we need — Cloudflare returns more
 * (challenge_ts, hostname, error-codes, action, cdata).
 */
interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export interface TurnstileVerificationResult {
  success: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies a Turnstile token with Cloudflare's siteverify API.
 *
 * @param token - The cf-turnstile-response from the form submission
 * @param secretKey - Your Turnstile secret key (from env)
 * @param remoteIp - The client's IP address (optional but recommended)
 * @returns Verification result with error message if failed
 */
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileVerificationResult> {
  if (!token || token.trim().length === 0) {
    return {
      success: false,
      error: "Captcha verification is required.",
    };
  }

  try {
    const body: Record<string, string> = {
      secret: secretKey,
      response: token,
    };

    /**
     * Passing the client IP is optional but recommended.
     * It helps Cloudflare detect token theft (someone intercepting
     * a token and using it from a different IP).
     */
    if (remoteIp) {
      body.remoteip = remoteIp;
    }

    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        success: false,
        error: "Captcha verification service unavailable. Please try again.",
      };
    }

    const result = (await response.json()) as SiteverifyResponse;

    if (!result.success) {
      return {
        success: false,
        error: "Captcha verification failed. Please try again.",
      };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Captcha verification failed unexpectedly. Please try again.",
    };
  }
}