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

export default {
  async fetch(request, env, ctx) {
    /**
     * Try to handle this request as a short URL redirect FIRST.
     * If it matches a shortcode in D1, we return a 302 immediately.
     * React Router never gets involved — this keeps redirects fast.
     *
     * If it's NOT a redirect (returns null), we fall through to
     * React Router which handles the frontend dashboard.
     */
    const redirectResponse = await handleRedirect(request, env, ctx);

    if (redirectResponse) {
      return redirectResponse;
    }

    // Not a redirect — let React Router handle it (dashboard, API, etc.)
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;