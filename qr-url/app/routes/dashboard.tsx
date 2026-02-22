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
import { SubdomainPicker } from "~/components/SubdomainPicker";
import { UrlList } from "~/components/UrlList";
import { QrList } from "~/components/QR/QRList";
import {
  validateSubdomainFormat,
  cleanSubdomain,
} from "~/lib/subdomain-validation";
import { deleteQrImage } from "~/lib/qr-storage";
import { fetchTotalClicksForUser } from "~/lib/analytics-queries";
import { getTierPermissions } from "~/lib/tier";

//
// Loader (server-side)
// 

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    const permissions = getTierPermissions("free");
    return {
      authenticated: false as const,
      subdomain: null,
      urlCount: 0,
      urls: [],
      qrCodes: [],
      qrCount: 0,
      totalClicks: 0,
      maxUrls: permissions.maxUrls,
      maxQrCodes: permissions.maxQrCodes,
    };
  }

  const db = args.context.cloudflare.env.qr_url_db;

  /**
   * Fetch user row (subdomain + plan) in one query.
   * Previously we only fetched subdomain. Now we also need the plan
   * to determine limits and permissions.
   */
  const userRow = await db
    .prepare("SELECT subdomain, plan FROM users WHERE clerk_user_id = ?")
    .bind(userId)
    .first<{ subdomain: string; plan: string }>();

  const permissions = getTierPermissions(userRow?.plan);

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

  const qrRows = await db
    .prepare(
      `SELECT id, url_id, url_type, encoded_url, storage_path, customization, created_at
       FROM qr_codes
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<{
      id: number;
      url_id: number;
      url_type: string;
      encoded_url: string;
      storage_path: string;
      customization: string;
      created_at: string;
    }>();

  const qrCodes = qrRows.results ?? [];

  const totalClicks = await fetchTotalClicksForUser(db, userId);

  return {
    authenticated: true as const,
    subdomain: userRow?.subdomain ?? null,
    urlCount: urls.length,
    urls,
    qrCodes,
    qrCount: qrCodes.length,
    totalClicks,
    maxUrls: permissions.maxUrls,
    maxQrCodes: permissions.maxQrCodes,
  };
}

// 
// Action (server-side)
// 

/**
 * Actions are dispatched by the "intent" field in the form data.
 *
 * Current intents:
 *   - "set-subdomain" — claim or change a subdomain
 *   - "delete-url"    — delete a URL the user owns
 *   - "delete-qr"     — delete a QR code (R2 image + D1 metadata)
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

  if (intent === "delete-qr") {
    return handleDeleteQr(args, userId, formData);
  }

  return data(
    { intent: "unknown", success: false, error: "Unknown action." },
    { status: 400 }
  );
}

// 
// Action handlers
// 

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
  const r2 = args.context.cloudflare.env.QR_IMAGES;
  const numericUrlId = Number(urlId);

  /**
   * SECURITY: Verify the URL belongs to this user BEFORE deleting
   * any associated data. Without this check, an attacker could submit
   * someone else's URL ID and wipe their click data and QR codes
   * even though the URL itself wouldn't be deleted (the final DELETE
   * checks user_id, but the child data would already be gone).
   */
  const urlOwnership = await db
    .prepare("SELECT id FROM urls WHERE id = ? AND user_id = ?")
    .bind(numericUrlId, userId)
    .first<{ id: number }>();

  if (!urlOwnership) {
    return data(
      { intent: "delete-url", success: false, error: "URL not found." },
      { status: 404 }
    );
  }

  /**
   * Now that we've confirmed ownership, clean up child data:
   * 1. Delete QR code images from R2 (not connected to D1)
   * 2. Delete QR code rows from D1
   * 3. Delete click analytics rows from D1
   * 4. Delete the URL itself
   */
  const qrRows = await db
    .prepare(
      "SELECT storage_path FROM qr_codes WHERE url_id = ? AND user_id = ?"
    )
    .bind(numericUrlId, userId)
    .all<{ storage_path: string }>();

  for (const row of qrRows.results ?? []) {
    await deleteQrImage(r2, row.storage_path);
  }

  await db
    .prepare("DELETE FROM qr_codes WHERE url_id = ? AND user_id = ?")
    .bind(numericUrlId, userId)
    .run();

  await db
    .prepare("DELETE FROM url_clicks WHERE url_id = ?")
    .bind(numericUrlId)
    .run();

  await db
    .prepare("DELETE FROM urls WHERE id = ? AND user_id = ?")
    .bind(numericUrlId, userId)
    .run();

  return data({ intent: "delete-url", success: true });
}

/**
 * Handles the "delete-qr" intent.
 * Deletes the R2 image and the D1 metadata row.
 */
async function handleDeleteQr(
  args: Route.ActionArgs,
  userId: string,
  formData: FormData
) {
  const qrId = formData.get("qrId") as string;

  if (!qrId) {
    return data(
      { intent: "delete-qr", success: false, error: "QR ID is required." },
      { status: 400 }
    );
  }

  const db = args.context.cloudflare.env.qr_url_db;
  const r2 = args.context.cloudflare.env.QR_IMAGES;

  /**
   * Fetch the storage path before deleting, so we can clean up R2.
   * Also verify ownership (user_id check).
   */
  const qrRow = await db
    .prepare("SELECT storage_path FROM qr_codes WHERE id = ? AND user_id = ?")
    .bind(Number(qrId), userId)
    .first<{ storage_path: string }>();

  if (!qrRow) {
    return data(
      { intent: "delete-qr", success: false, error: "QR code not found." },
      { status: 404 }
    );
  }

  // Delete from R2 first, then D1
  await deleteQrImage(r2, qrRow.storage_path);

  await db
    .prepare("DELETE FROM qr_codes WHERE id = ? AND user_id = ?")
    .bind(Number(qrId), userId)
    .run();

  return data({ intent: "delete-qr", success: true });
}

// 
// Component (client-side)
// 

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  if (!loaderData.authenticated) {
    return <RedirectToSignIn />;
  }

  const { subdomain, urlCount, urls, qrCodes, qrCount, totalClicks, maxUrls, maxQrCodes } = loaderData;

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

      {totalClicks > 0 && (
        <p>
          Your links have received{" "}
          <strong>{totalClicks.toLocaleString("en-US")}</strong> total click
          {totalClicks !== 1 ? "s" : ""}.
        </p>
      )}

      <SubdomainPicker currentSubdomain={subdomain} />

      <UrlList
        urls={urls}
        urlCount={urlCount}
        maxUrls={maxUrls}
      />

      <QrList
        qrCodes={qrCodes}
        qrCount={qrCount}
        maxQrCodes={maxQrCodes}
      />
    </div>
  );
}