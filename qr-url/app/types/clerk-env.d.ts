/**
 * Extend the auto-generated Env interface with variables that come
 * from .dev.vars (local) and Cloudflare secrets (production).
 *
 * wrangler's cf-typegen generates the Env interface from wrangler.jsonc
 * bindings and vars. But secrets (like CLERK_SECRET_KEY) and .dev.vars
 * entries are NOT included in that generation — they're runtime-only.
 *
 * This file tells TypeScript those variables exist so you get
 * autocomplete and type checking when accessing them via
 * context.cloudflare.env.CLERK_SECRET_KEY
 *
 * Interface merging: TypeScript automatically merges this Env interface
 * with the one in worker-configuration.d.ts. You don't need to import
 * anything — both declarations combine into one type.
 */
interface Env {
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
}