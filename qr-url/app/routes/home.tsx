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
} from "~/components/Anonymous-shorten-form";
import { validateUrl } from "~/lib/url-validation";
import { generateUniqueShortcode } from "~/lib/shortcode";
import { verifyTurnstileToken } from "~/lib/turnstile";
import {
  checkRateLimit,
  incrementRateLimit,
  getClientIp,
} from "~/lib/rate-limit";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SITE_DOMAIN = "yourdomain.com";

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

  const hasCreatedUrl =
    actionData != null && "createdUrl" in actionData && actionData.createdUrl != null;

  const hasError =
    actionData != null && "error" in actionData && actionData.error != null;

  const remaining =
    hasCreatedUrl && typeof actionData.remaining === "number"
      ? actionData.remaining
      : loaderData.remaining;

  return (
    <div>
      <h1>Shorten any URL</h1>
      <p>
        Paste a long URL and get a short one. No account needed.
      </p>

      {hasCreatedUrl && (
        <AnonymousUrlCreated
          fullShortUrl={actionData.createdUrl.fullShortUrl}
          originalUrl={actionData.createdUrl.originalUrl!}
          remaining={remaining}
        />
      )}

      {hasError && (
        <p role="alert">
          {actionData.error}
        </p>
      )}

      <AnonymousShortenForm
        turnstileSiteKey={turnstileSiteKey}
        remaining={remaining}
      />

      <p>
        Want custom shortcodes, branded URLs, analytics, and QR codes?{" "}
        <a href="/dashboard" style={{ color: "#2563eb" }}>
          Sign up for free
        </a>
      </p>
    </div>
  );
}
