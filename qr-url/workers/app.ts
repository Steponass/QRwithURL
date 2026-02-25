import { createRequestHandler } from "react-router";
import { handleRedirect } from "./redirect";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

/**
 * Headers applied to every response the Worker sends, regardless of
 * whether it's a redirect or a React Router HTML response.
 *
 * X-Content-Type-Options: nosniff
 *   Prevents browsers from MIME-sniffing a response away from the declared
 *   Content-Type. Without this, a browser might execute a plain-text
 *   response as JavaScript if it "looks" like a script.
 *
 * X-Frame-Options: DENY
 *   Prevents any page on this domain from being embedded in an <iframe>.
 *   This closes the clickjacking attack surface where an attacker overlays
 *   a transparent copy of your page on top of a malicious site.
 *
 * Referrer-Policy: strict-origin-when-cross-origin
 *   Sends the full URL as referrer for same-origin requests, but only
 *   the origin (no path) for cross-origin requests, and nothing for
 *   requests from HTTPS to HTTP. Prevents leaking full dashboard URLs
 *   (which might contain IDs) to third-party sites.
 *
 * Note on Content-Security-Policy:
 *   CSP is intentionally omitted here. Clerk and ECharts load resources
 *   from their own CDNs, and the Turnstile widget injects inline scripts.
 *   A correct CSP requires auditing every external origin these libraries
 *   use and keeping that list up to date as they release new versions.
 *   An incorrect or overly-broad CSP is worse than none. Add it when
 *   you have time to audit and test it properly.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/**
 * Copies a response and adds security headers to it.
 *
 * We can't mutate an existing Response — Headers objects become immutable
 * once attached to a Response. Response.redirect() in particular returns
 * a frozen response. We create a new Response that copies the original's
 * status, statusText, body, and existing headers, then adds our own.
 *
 * For redirect responses (302), we preserve the Location header by
 * copying all existing headers first, then layering security headers on top.
 */
function applySecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);

  for (const [headerName, headerValue] of Object.entries(SECURITY_HEADERS)) {
    newHeaders.set(headerName, headerValue);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    /**
     * Try to handle this request as a short URL redirect FIRST.
     * If it matches a shortcode in D1, we return a 302 immediately.
     * React Router never gets involved — this keeps redirects fast.
     *
     * If it's NOT a redirect (returns null), we fall through to
     * React Router which handles the frontend dashboard.
     *
     */
    const redirectResponse = await handleRedirect(request, env, ctx);

    if (redirectResponse) {
      return applySecurityHeaders(redirectResponse);
    }

    // Not a redirect — let React Router handle it (dashboard, API, etc.)
    const appResponse = await requestHandler(request, {
      cloudflare: { env, ctx },
    });

    return applySecurityHeaders(appResponse);
  },
} satisfies ExportedHandler<Env>;