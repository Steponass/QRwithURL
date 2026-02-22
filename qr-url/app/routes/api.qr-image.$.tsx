/**
 *
 * Serves QR code PNG images from R2 storage.
 *
 * Why a route instead of direct R2 public URLs?
 *   - Works in local development (no public R2 access locally)
 *   - Authentication: could restrict access to image owner
 *   - Consistent URL pattern regardless of R2 config
 *   - No need to expose R2 bucket publicly
 *
 * The splat (*) in the route catches the full storage path:
 *   /api/qr-image/qr-codes/user_abc/xyz123.png
 *   → storagePath = "qr-codes/user_abc/xyz123.png"
 *
 * For now this is public (no auth check). QR code images don't
 * contain sensitive data — they're just encoded URLs that are
 * already public. If needed, we could add owner-only access later.
 */

import type { Route } from "./+types/api.qr-image.$";

// ---------------------------------------------------------------------------
// Loader (GET request handler)
// ---------------------------------------------------------------------------

export async function loader(args: Route.LoaderArgs) {
  const r2 = args.context.cloudflare.env.QR_IMAGES;

  /**
   * Extract the storage path from the URL.
   * The route is /api/qr-image/* so everything after that is the path.
   *
   * React Router v7 provides splat params as "*" in params.
   */
  const storagePath = args.params["*"];

  if (!storagePath) {
    return new Response("Not found", { status: 404 });
  }

  /** Read the object from R2 */
  const object = await r2.get(storagePath);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  /**
   * Return the image with proper headers.
   * R2 objects have a body that implements ReadableStream.
   */
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
