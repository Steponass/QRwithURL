/**
 * Dashboard route — the main authenticated user page.
 *
 * This route is protected: the loader checks if the user is signed in.
 * If not, the component renders <RedirectToSignIn /> which sends the
 * user to Clerk's hosted Account Portal sign-in page.
 *
 * The loader also queries D1 for the user's subdomain. If the user
 * is new (first visit after signup), they won't have a row in the
 * users table yet, and subdomain will be null. That's fine — they
 * chose to skip subdomain setup, so we just show a prompt.
 */

import { getAuth } from "@clerk/react-router/ssr.server";
import { useUser, RedirectToSignIn } from "@clerk/react-router";
import type { Route } from "./+types/dashboard";

// ---------------------------------------------------------------------------
// Loader (server-side)
// ---------------------------------------------------------------------------

/**
 * What getAuth returns (the parts we use):
 *   userId   — Clerk's unique user ID string, or null if not signed in
 *   sessionId — Current session ID
 *   getToken  — Function to get a session JWT (for calling external APIs)
 *
 * We only need userId here: to verify they're signed in and to look
 * up their subdomain in D1.
 */
export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  /**
   * If not signed in, we DON'T redirect server-side. Why?
   *
   * We're using Clerk's hosted Account Portal for sign-in, which
   * lives on Clerk's domain (not ours). We don't have a /sign-in
   * route in our app. The <RedirectToSignIn /> component on the
   * client side knows the correct Account Portal URL automatically.
   *
   * We return authenticated: false and let the component handle it.
   * This adds one extra round trip compared to a server redirect,
   * but it's the correct approach for hosted sign-in pages.
   */
  if (!userId) {
    return {
      authenticated: false as const,
      subdomain: null,
      urlCount: 0,
    };
  }

  /**
   * Query D1 for this user's subdomain.
   *
   * If the user just signed up and hasn't picked a subdomain yet,
   * this returns null (no row in users table). That's expected —
   * we let them skip subdomain selection.
   */
  const db = args.context.cloudflare.env.qr_url_db;

  const userRow = await db
    .prepare("SELECT subdomain FROM users WHERE clerk_user_id = ?")
    .bind(userId)
    .first<{ subdomain: string }>();

  /**
   * Count how many URLs this user has created.
   * We'll use this to show a simple stat on the dashboard.
   */
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
// Component (client-side)
// ---------------------------------------------------------------------------

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  /**
   * If the loader determined the user isn't signed in, render
   * Clerk's <RedirectToSignIn />. This component automatically
   * redirects to Clerk's hosted Account Portal sign-in page,
   * with a return URL back to /dashboard after sign-in.
   */
  if (!loaderData.authenticated) {
    return <RedirectToSignIn />;
  }

  const { subdomain, urlCount } = loaderData;

  /**
   * useUser() gives us the full Clerk user object on the client side.
   * This includes name, email, avatar, etc. — all managed by Clerk,
   * not stored in our database.
   *
   * isLoaded is false during the initial client-side hydration while
   * Clerk fetches the user object. We show a simple loading state.
   */
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

      <SubdomainStatus subdomain={subdomain} />
      <UrlStats count={urlCount} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SubdomainStatus({ subdomain }: { subdomain: string | null }) {
  if (subdomain) {
    return (
      <section style={{ marginTop: "1.5rem" }}>
        <h2>Your Subdomain</h2>
        <p>
          <strong>{subdomain}</strong>.yourdomain.com
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2>Subdomain</h2>
      <p>You haven't picked a subdomain yet.</p>
      <p style={{ color: "#666" }}>
        A subdomain lets you create branded short URLs like{" "}
        <strong>yourname.yourdomain.com/link</strong>
      </p>
      {/* TODO: Phase 3 — subdomain picker form */}
    </section>
  );
}

function UrlStats({ count }: { count: number }) {
  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2>Your URLs</h2>
      <p>
        {count} of 10 URLs created
      </p>
      {/* TODO: Phase 3 — URL list and creation form */}
    </section>
  );
}