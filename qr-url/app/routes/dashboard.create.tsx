/**
 * dashboard.create.tsx — /dashboard/create route
 *
 * Dedicated page for creating a new short URL.
 * Separated from the dashboard to keep concerns focused:
 *   - Dashboard = overview (subdomain, URL list, stats)
 *   - Create = form + creation logic
 *
 * Loader: fetches user's subdomain and URL count (needed by the form)
 * Action: validates input, generates/validates shortcode, inserts URL
 */

import { getAuth } from "@clerk/react-router/ssr.server";
import { RedirectToSignIn } from "@clerk/react-router";
import { data, Link } from "react-router";
import type { Route } from "./+types/dashboard.create";
import {
  UrlCreationForm,
  UrlCreatedSuccess,
} from "~/components/Url-creation-form";
import { validateUrl } from "~/lib/url-validation";
import {
  generateUniqueShortcode,
  validateCustomShortcode,
} from "~/lib/shortcode";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_URLS_PER_USER = 10;

/**
 * TODO: Replace with your actual domain once purchased.
 * Used to construct the full short URL returned after creation.
 */
const SITE_DOMAIN = "yourdomain.com";

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return {
      authenticated: false as const,
      subdomain: null,
      urlCount: 0,
    };
  }

  const db = args.context.cloudflare.env.qr_url_db;

  const userRow = await db
    .prepare("SELECT subdomain FROM users WHERE clerk_user_id = ?")
    .bind(userId)
    .first<{ subdomain: string }>();

  const urlCountRow = await db
    .prepare("SELECT COUNT(*) as count FROM urls WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();

  return {
    authenticated: true as const,
    subdomain: userRow?.subdomain ?? null,
    urlCount: urlCountRow?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action(args: Route.ActionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return data(
      { success: false, error: "Not authenticated." },
      { status: 401 }
    );
  }

  const db = args.context.cloudflare.env.qr_url_db;
  const formData = await args.request.formData();

  // --- Extract form fields ---
  const originalUrl = (formData.get("originalUrl") as string) ?? "";
  const urlFormat = (formData.get("urlFormat") as string) ?? "short";
  const useCustomShortcode = formData.get("useCustomShortcode") === "true";
  const customShortcode = (formData.get("customShortcode") as string) ?? "";

  // --- Validate URL ---
  const urlValidation = validateUrl(originalUrl);

  if (!urlValidation.isValid) {
    return data(
      { success: false, error: urlValidation.error },
      { status: 400 }
    );
  }

  // --- Enforce URL limit ---
  const urlCountRow = await db
    .prepare("SELECT COUNT(*) as count FROM urls WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();

  const currentCount = urlCountRow?.count ?? 0;

  if (currentCount >= MAX_URLS_PER_USER) {
    return data(
      {
        success: false,
        error: `You've reached the limit of ${MAX_URLS_PER_USER} URLs. Delete an existing URL to create a new one.`,
      },
      { status: 403 }
    );
  }

  // --- Determine subdomain for this URL ---
  let urlSubdomain: string | null = null;

  if (urlFormat === "branded") {
    const userRow = await db
      .prepare("SELECT subdomain FROM users WHERE clerk_user_id = ?")
      .bind(userId)
      .first<{ subdomain: string }>();

    if (!userRow?.subdomain) {
      return data(
        {
          success: false,
          error: "You need to set up a subdomain before creating branded URLs.",
        },
        { status: 400 }
      );
    }

    urlSubdomain = userRow.subdomain;
  }

  // --- Resolve shortcode (auto-generate or validate custom) ---
  let shortcode: string;

  if (useCustomShortcode) {
    const cleaned = customShortcode.trim().toLowerCase();

    const shortcodeValidation = validateCustomShortcode(cleaned);

    if (!shortcodeValidation.isValid) {
      return data(
        { success: false, error: shortcodeValidation.error },
        { status: 400 }
      );
    }

    // Check uniqueness in the correct scope
    const existingRow = await db
      .prepare(
        `SELECT 1 FROM urls
         WHERE COALESCE(subdomain, '') = COALESCE(?, '')
           AND shortcode = ?
         LIMIT 1`
      )
      .bind(urlSubdomain, cleaned)
      .first();

    if (existingRow) {
      const scopeDescription =
        urlSubdomain === null
          ? "globally"
          : `under ${urlSubdomain}.${SITE_DOMAIN}`;

      return data(
        {
          success: false,
          error: `Shortcode "${cleaned}" is already taken ${scopeDescription}.`,
        },
        { status: 409 }
      );
    }

    shortcode = cleaned;
  } else {
    const generated = await generateUniqueShortcode(db, urlSubdomain);

    if (!generated) {
      return data(
        {
          success: false,
          error:
            "Failed to generate a unique shortcode after multiple attempts. Please try again.",
        },
        { status: 500 }
      );
    }

    shortcode = generated;
  }

  // --- Insert the URL ---
  await db
    .prepare(
      `INSERT INTO urls (user_id, shortcode, original_url, subdomain)
       VALUES (?, ?, ?, ?)`
    )
    .bind(userId, shortcode, urlValidation.normalizedUrl, urlSubdomain)
    .run();

  // --- Build the full short URL for display ---
  const fullShortUrl =
    urlSubdomain === null
      ? `${SITE_DOMAIN}/${shortcode}`
      : `${urlSubdomain}.${SITE_DOMAIN}/${shortcode}`;

  return data({
    success: true,
    createdUrl: {
      shortcode,
      subdomain: urlSubdomain,
      originalUrl: urlValidation.normalizedUrl!,
      fullShortUrl,
    },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardCreate({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  if (!loaderData.authenticated) {
    return <RedirectToSignIn />;
  }

  const { subdomain, urlCount } = loaderData;

  return (
    <div style={{ padding: "2rem", maxWidth: "600px" }}>
      <Link to="/dashboard" style={{ color: "#2563eb" }}>
        &larr; Back to Dashboard
      </Link>

      <h1 style={{ marginTop: "1rem" }}>Create Short URL</h1>

      {/* Show success message if URL was just created */}
      {actionData && "createdUrl" in actionData && actionData.createdUrl && (
        <UrlCreatedSuccess createdUrl={actionData.createdUrl} />
      )}

      {/* Show server-side error if action failed */}
      {actionData && "error" in actionData && actionData.error && (
        <p style={{ color: "#dc2626", marginBottom: "1rem" }} role="alert">
          {actionData.error}
        </p>
      )}

      <UrlCreationForm
        subdomain={subdomain}
        urlCount={urlCount}
        maxUrls={MAX_URLS_PER_USER}
      />
    </div>
  );
}
