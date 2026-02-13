/**
 * Dashboard route — the main authenticated user page.
 *
 * Loader: fetches subdomain, URL count, and all user URLs from D1.
 * Action: handles subdomain set/edit and URL deletion via "intent" field.
 * Component: renders subdomain picker, URL list, and create link.
 */

import { getAuth } from "@clerk/react-router/ssr.server";
import { useUser, RedirectToSignIn } from "@clerk/react-router";
import { data } from "react-router";
import type { Route } from "./+types/dashboard";
import { SubdomainPicker } from "~/components/Subdomain-picker";
import { UrlList } from "~/components/Url-list";
import {
  validateSubdomainFormat,
  cleanSubdomain,
} from "~/lib/subdomain-validation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_URLS_PER_USER = 10;

// ---------------------------------------------------------------------------
// Loader (server-side)
// ---------------------------------------------------------------------------

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return {
      authenticated: false as const,
      subdomain: null,
      urlCount: 0,
      urls: [],
    };
  }

  const db = args.context.cloudflare.env.qr_url_db;

  const userRow = await db
    .prepare("SELECT subdomain FROM users WHERE clerk_user_id = ?")
    .bind(userId)
    .first<{ subdomain: string }>();

  /**
   * Fetch all URLs for this user, newest first.
   * With a 10-URL limit, there's no need for pagination.
   * We select the fields needed by the UrlListItem component.
   */
  const urlRows = await db
    .prepare(
      `SELECT id, shortcode, original_url, subdomain, created_at
       FROM urls
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<{
      id: number;
      shortcode: string;
      original_url: string;
      subdomain: string | null;
      created_at: string;
    }>();

  const urls = urlRows.results ?? [];

  return {
    authenticated: true as const,
    subdomain: userRow?.subdomain ?? null,
    urlCount: urls.length,
    urls,
  };
}

// ---------------------------------------------------------------------------
// Action (server-side)
// ---------------------------------------------------------------------------

/**
 * Actions are dispatched by the "intent" field in the form data.
 *
 * Current intents:
 *   - "set-subdomain" — claim or change a subdomain
 *   - "delete-url"    — delete a URL the user owns
 */
export async function action(args: Route.ActionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return data(
      { intent: "unknown", success: false, error: "Not authenticated." },
      { status: 401 }
    );
  }

  const formData = await args.request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "set-subdomain") {
    return handleSetSubdomain(args, userId, formData);
  }

  if (intent === "delete-url") {
    return handleDeleteUrl(args, userId, formData);
  }

  return data(
    { intent: "unknown", success: false, error: "Unknown action." },
    { status: 400 }
  );
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handles the "set-subdomain" intent.
 * Validates format, checks uniqueness, upserts into users table.
 */
async function handleSetSubdomain(
  args: Route.ActionArgs,
  userId: string,
  formData: FormData
) {
  const rawSubdomain = formData.get("subdomain") as string;

  if (!rawSubdomain) {
    return data(
      { intent: "set-subdomain", success: false, error: "Subdomain is required." },
      { status: 400 }
    );
  }

  const cleaned = cleanSubdomain(rawSubdomain);

  const validation = validateSubdomainFormat(cleaned);

  if (!validation.isValid) {
    return data(
      { intent: "set-subdomain", success: false, error: validation.error },
      { status: 400 }
    );
  }

  const db = args.context.cloudflare.env.qr_url_db;

  const existingRow = await db
    .prepare(
      "SELECT clerk_user_id FROM users WHERE subdomain = ? AND clerk_user_id != ?"
    )
    .bind(cleaned, userId)
    .first<{ clerk_user_id: string }>();

  if (existingRow) {
    return data(
      {
        intent: "set-subdomain",
        success: false,
        error: `"${cleaned}" is already taken.`,
      },
      { status: 409 }
    );
  }

  await db
    .prepare(
      `INSERT INTO users (clerk_user_id, subdomain)
       VALUES (?, ?)
       ON CONFLICT (clerk_user_id) DO UPDATE SET subdomain = ?`
    )
    .bind(userId, cleaned, cleaned)
    .run();

  return data({ intent: "set-subdomain", success: true });
}

/**
 * Handles the "delete-url" intent.
 *
 * Verifies that the URL belongs to the requesting user before
 * deleting. This prevents one user from deleting another user's
 * URLs by crafting a form submission with a different urlId.
 *
 * After deletion, the shortcode becomes available again:
 *   - Short format: globally available (anyone can claim it)
 *   - Branded format: available within that subdomain
 *
 * The user is warned about this in the confirmation dialog
 * (see DeleteButton in url-list-item.tsx).
 */
async function handleDeleteUrl(
  args: Route.ActionArgs,
  userId: string,
  formData: FormData
) {
  const urlId = formData.get("urlId") as string;

  if (!urlId) {
    return data(
      { intent: "delete-url", success: false, error: "URL ID is required." },
      { status: 400 }
    );
  }

  const db = args.context.cloudflare.env.qr_url_db;

  /**
   * DELETE with a WHERE clause on both id and user_id.
   * If the URL doesn't exist or belongs to someone else,
   * this simply deletes 0 rows — no error, no data leak.
   */
  const result = await db
    .prepare("DELETE FROM urls WHERE id = ? AND user_id = ?")
    .bind(Number(urlId), userId)
    .run();

  /**
   * result.meta.changes tells us how many rows were deleted.
   * 0 = URL not found or not owned by this user.
   * 1 = successfully deleted.
   */
  if (result.meta.changes === 0) {
    return data(
      { intent: "delete-url", success: false, error: "URL not found." },
      { status: 404 }
    );
  }

  return data({ intent: "delete-url", success: true });
}

// ---------------------------------------------------------------------------
// Component (client-side)
// ---------------------------------------------------------------------------

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  if (!loaderData.authenticated) {
    return <RedirectToSignIn />;
  }

  const { subdomain, urlCount, urls } = loaderData;

  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return <p>Loading...</p>;
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "600px" }}>
      <h1>Dashboard</h1>

      <p>
        Welcome, {user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "there"}!
      </p>

      <SubdomainPicker currentSubdomain={subdomain} />

      <UrlList
        urls={urls}
        urlCount={urlCount}
        maxUrls={MAX_URLS_PER_USER}
      />
    </div>
  );
}
