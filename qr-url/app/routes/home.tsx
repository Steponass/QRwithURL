/**
 * Home route — the public-facing homepage.
 *
 * For anonymous visitors: shows a simple URL shortening form with
 * Turnstile captcha. URLs created here are short format only,
 * auto-generated shortcodes, expire after 365 days, and have no
 * analytics or editing.
 *
 * For signed-in users: redirects to /dashboard immediately.
 * There's no reason for an authenticated user to use the anonymous
 * form when they have a better experience on the dashboard.
 *
 * Loader: checks auth (redirect if signed in), checks rate limit
 * Action: verifies Turnstile, checks rate limit, creates URL
 */

import { getAuth } from "@clerk/react-router/ssr.server";
import { data, redirect } from "react-router";
import type { Route } from "./+types/home";
import {
  AnonymousShortenForm,
  AnonymousUrlCreated,
} from "~/components/AnonymousShortenForm";
import { validateUrl } from "~/lib/url-validation";
import { generateUniqueShortcode } from "~/lib/shortcode";
import { verifyTurnstileToken } from "~/lib/turnstile";
import {
  checkRateLimit,
  incrementRateLimit,
  getClientIp,
} from "~/lib/rate-limit";
import { SITE_DOMAIN } from "~/lib/constants";

// ---------------------------------------------------------------------------
// Action result types
// ---------------------------------------------------------------------------

/**
 * Explicit types for the action's return values.
 *
 * React Router infers action data as a union of all data() returns.
 * Without explicit types, TS can't guarantee that 'remaining' or
 * 'createdUrl' exist on a given branch. These types let the
 * component narrow correctly using 'success' as a discriminant.
 */
type ActionSuccess = {
  success: true;
  createdUrl: {
    shortcode: string;
    originalUrl: string;
    fullShortUrl: string;
  };
  remaining: number;
};

type ActionError = {
  success: false;
  error: string;
};

type ActionResult = ActionSuccess | ActionError;

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QR-URL — Shorten any URL for free" },
    { name: "description", content: "Free URL shortener with QR code generation." },
  ];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader(args: Route.LoaderArgs) {
  /**
   * If the user is signed in, redirect to the dashboard.
   * Unlike the dashboard route (where we can't redirect to Clerk's
   * external sign-in page from the server), here we're redirecting
   * to our own /dashboard route — a normal server-side redirect works.
   */
  const { userId } = await getAuth(args);

  if (userId) {
    return redirect("/dashboard");
  }

  /**
   * Check how many anonymous URLs this IP has created today.
   * We pass the remaining count to the form so it can show
   * "3 of 5 free URLs remaining today" or hide the form entirely.
   */
  const clientIp = getClientIp(args.request);
  const kv = args.context.cloudflare.env.RATE_LIMIT_KV;
  const rateLimitCheck = await checkRateLimit(kv, clientIp);

  /**
   * Pass the Turnstile site key to the client.
   * This is a public key — safe to expose in client-side JS.
   *
   * In development, use Cloudflare's test key that always passes:
   *   1x00000000000000000000AA
   *
   * In production, use your real site key from the Cloudflare
   * Turnstile dashboard.
   */
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  return {
    turnstileSiteKey,
    remaining: rateLimitCheck.remaining,
  };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action(args: Route.ActionArgs) {
  const formData = await args.request.formData();

  const originalUrl = (formData.get("originalUrl") as string) ?? "";
  const turnstileToken =
    (formData.get("cf-turnstile-response") as string) ?? "";

  // --- 1. Validate URL ---
  const urlValidation = validateUrl(originalUrl);

  if (!urlValidation.isValid) {
    return data(
      { success: false, error: urlValidation.error },
      { status: 400 }
    );
  }

  // --- 2. Verify Turnstile token ---
  const turnstileSecretKey =
    args.context.cloudflare.env.TURNSTILE_SECRET_KEY;
  const clientIp = getClientIp(args.request);

  const turnstileResult = await verifyTurnstileToken(
    turnstileToken,
    turnstileSecretKey,
    clientIp
  );

  if (!turnstileResult.success) {
    return data(
      { success: false, error: turnstileResult.error },
      { status: 403 }
    );
  }

  // --- 3. Check rate limit ---
  const kv = args.context.cloudflare.env.RATE_LIMIT_KV;
  const rateLimitCheck = await checkRateLimit(kv, clientIp);

  if (!rateLimitCheck.allowed) {
    return data(
      { success: false, error: rateLimitCheck.error },
      { status: 429 }
    );
  }

  // --- 4. Generate shortcode ---
  const db = args.context.cloudflare.env.qr_url_db;

  /**
   * Anonymous URLs are always short format (subdomain = null).
   * Pass null to scope the uniqueness check globally.
   */
  const shortcode = await generateUniqueShortcode(db, null);

  if (!shortcode) {
    return data(
      {
        success: false,
        error: "Failed to generate a unique shortcode. Please try again.",
      },
      { status: 500 }
    );
  }

  // --- 5. Insert URL with expiration ---
  /**
   * Anonymous URLs differ from authenticated ones:
   *   - user_id is NULL (no account to link to)
   *   - subdomain is NULL (always short format)
   *   - expires_at is set to 365 days from now
   *
   * datetime('now', '+365 days') is SQLite's date arithmetic.
   * It adds exactly 365 days to the current UTC timestamp.
   */
  await db
    .prepare(
      `INSERT INTO urls (user_id, shortcode, original_url, subdomain, expires_at)
       VALUES (NULL, ?, ?, NULL, datetime('now', '+365 days'))`
    )
    .bind(shortcode, urlValidation.normalizedUrl)
    .run();

  // --- 6. Increment rate limit (only after successful creation) ---
  const newRemaining = await incrementRateLimit(kv, clientIp);

  const fullShortUrl = `${SITE_DOMAIN}/${shortcode}`;

  return data({
    success: true,
    createdUrl: {
      shortcode,
      originalUrl: urlValidation.normalizedUrl,
      fullShortUrl,
    },
    remaining: newRemaining,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { turnstileSiteKey } = loaderData;

  /**
   * Cast to our explicit union type. React Router's inferred type
   * is a union of all data() shapes, which TS can't narrow on.
   * Our ActionResult type uses 'success' as a proper discriminant.
   */
  const result = actionData as ActionResult | undefined;

  /**
   * After a successful creation, use the remaining count from
   * the action response (most up-to-date). Otherwise use the
   * loader's remaining count.
   */
  const remaining =
    result?.success === true
      ? result.remaining
      : loaderData.remaining;

  /** Helpers to avoid long ternary chains in JSX */
  const isSuccess = result?.success === true;
  const isError = result?.success === false;

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Shorten any URL</h1>
      <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
        Paste a long URL and get a short one. No account needed.
      </p>

      {/* Show success message if URL was just created */}
      {isSuccess && (
        <AnonymousUrlCreated
          fullShortUrl={result.createdUrl.fullShortUrl}
          originalUrl={result.createdUrl.originalUrl}
          remaining={remaining}
        />
      )}

      {/* Show server-side error if action failed */}
      {isError && (
        <p style={{ color: "#dc2626", marginBottom: "1rem" }} role="alert">
          {result.error}
        </p>
      )}

      <AnonymousShortenForm
        turnstileSiteKey={turnstileSiteKey}
        remaining={remaining}
      />

      <p
        style={{
          marginTop: "2rem",
          fontSize: "0.875rem",
          color: "#9ca3af",
          textAlign: "center",
        }}
      >
        Want custom shortcodes, branded URLs, analytics, and QR codes?{" "}
        <a href="/dashboard" style={{ color: "#2563eb" }}>
          Sign up for free
        </a>
      </p>
    </div>
  );
}