/**
 * Root layout for the QR-URL application.
 *
 * Clerk authentication is integrated using the SSR approach
 * (rootAuthLoader) rather than the middleware approach (clerkMiddleware).
 *
 * Why SSR instead of middleware?
 * Both work on Cloudflare Workers. We chose SSR because:
 *   - No need to enable v8_middleware future flag
 *   - No changes to react-router.config.ts
 *   - Older, more battle-tested path with more examples
 *   - Same functionality: validates session cookie server-side,
 *     passes auth state to ClerkProvider on the client
 *
 * Why pass secretKey explicitly?
 * On Cloudflare Workers, process.env doesn't exist. Environment
 * variables come through the Worker's env binding. Clerk's
 * rootAuthLoader normally reads process.env.CLERK_SECRET_KEY,
 * which would fail silently on Cloudflare. By passing it explicitly
 * from context.cloudflare.env, we guarantee Clerk gets the key
 * regardless of runtime.
 */

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { rootAuthLoader } from "@clerk/react-router/ssr.server";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/react-router";

/**
 * Root loader — runs on every page load (server-side).
 *
 * rootAuthLoader reads the user's session cookie, validates it with
 * Clerk's backend, and returns auth state (userId, sessionId, etc.)
 * as part of the loader data. This data is then consumed by
 * <ClerkProvider> on the client side.
 *
 * The two keys are accessed differently because they have different
 * security requirements:
 *
 * publishableKey — This is PUBLIC (safe to expose in client JS).
 *   It lives in .env as VITE_CLERK_PUBLISHABLE_KEY. The VITE_ prefix
 *   tells Vite to inline it at build time, replacing every occurrence
 *   of import.meta.env.VITE_CLERK_PUBLISHABLE_KEY with the actual
 *   string value in the compiled JavaScript. This works in both
 *   client and server code.
 *
 * secretKey — This is SECRET (never exposed to the browser).
 *   It lives in .dev.vars locally and Cloudflare Secrets in production.
 *   These are injected at runtime through the Worker's env parameter,
 *   accessible via context.cloudflare.env. We must pass it explicitly
 *   because Clerk normally reads process.env.CLERK_SECRET_KEY, which
 *   doesn't exist on Cloudflare Workers.
 */
export async function loader(args: Route.LoaderArgs) {
  return rootAuthLoader(args, {
    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: args.context.cloudflare.env.CLERK_SECRET_KEY,
  });
}

/**
 * Layout wraps EVERY page — both the App component and the ErrorBoundary.
 * This is the <html> shell. ClerkProvider does NOT go here because
 * it needs loaderData, which is only available inside App.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * App component — the root of your React tree.
 *
 * ClerkProvider wraps everything here. It receives loaderData from
 * rootAuthLoader, which contains the auth session state. All child
 * routes can then use Clerk hooks (useUser, useAuth, etc.).
 *
 * The header with SignedIn/SignedOut is temporary — just for testing
 * that auth works. We'll replace it with a proper layout later.
 */
export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider loaderData={loaderData}>
      <header style={{ padding: "1rem", borderBottom: "1px solid #eee" }}>
        <SignedOut>
          <SignInButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <main>
        <Outlet />
      </main>
    </ClerkProvider>
  );
}

/**
 * Error boundary — catches errors in any child route.
 * Renders outside ClerkProvider since auth state may not be available
 * when errors occur.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre
          style={{
            padding: "1rem",
            background: "#f5f5f5",
            overflow: "auto",
          }}
        >
          {stack}
        </pre>
      )}
    </main>
  );
}
