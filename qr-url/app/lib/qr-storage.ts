/**
 *
 * R2 storage operations for QR code images.
 * Server-side only — called from route actions.
 *
 * R2 (Cloudflare's S3-compatible object store) gives us:
 *   - Cheap blob storage ($0.015/GB/month)
 *   - Public URLs via r2.dev subdomain or custom domain
 *   - Auto-managed by Cloudflare (no separate service)
 *   - Local emulation in wrangler dev
 *
 * Storage path convention:
 *   qr-codes/{userId}/{randomId}.png
 *
 * Why include userId in the path?
 *   - Organized by user (easy to browse in R2 dashboard)
 *   - Could enable per-user cleanup if account is deleted
 *   - No collision between users even if random IDs overlap
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Uploads a QR code PNG image to R2.
 *
 * @param r2 - R2 bucket binding from env
 * @param userId - Clerk user ID (for path organization)
 * @param pngBytes - Raw PNG image data as Uint8Array
 * @returns The R2 storage key (path) for the uploaded object
 */
export async function uploadQrImage(
  r2: R2Bucket,
  userId: string,
  pngBytes: Uint8Array
): Promise<string> {
  const randomId = generateRandomId();
  const storagePath = `qr-codes/${userId}/${randomId}.png`;

  await r2.put(storagePath, pngBytes, {
    httpMetadata: {
      contentType: "image/png",
      /**
       * Cache the image for 1 year. QR codes are immutable — once
       * generated, the image never changes. If the user wants different
       * settings, they generate a new QR code.
       */
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return storagePath;
}

/**
 * Deletes a QR code image from R2.
 *
 * Called when a user deletes a QR code, or when a URL is deleted
 * and its QR codes cascade-delete from D1.
 *
 * R2 delete is idempotent — deleting a non-existent key doesn't error.
 */
export async function deleteQrImage(
  r2: R2Bucket,
  storagePath: string
): Promise<void> {
  await r2.delete(storagePath);
}

/**
 * Builds the public URL for an R2 object.
 *
 * In development, R2 objects aren't publicly accessible via URL.
 * The route serves them directly by reading from R2.
 *
 * In production, you have two options:
 *   1. Enable r2.dev public access in the Cloudflare dashboard
 *      → https://pub-{hash}.r2.dev/qr-codes/{userId}/{id}.png
 *   2. Custom domain (recommended for production)
 *      → https://images.yourdomain.com/qr-codes/{userId}/{id}.png
 *
 * For now, we return the storage path and serve it via a route.
 * This keeps development simple and avoids public URL config issues.
 *
 * @param storagePath - The R2 key returned by uploadQrImage
 * @returns A relative URL that our app can serve
 */
export function buildQrPublicPath(storagePath: string): string {
  return `/api/qr-image/${storagePath}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a random 12-character ID for file naming.
 * Uses crypto.getRandomValues for unpredictability.
 */
function generateRandomId(): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);

  let result = "";
  for (let i = 0; i < 12; i++) {
    result += charset[bytes[i] % charset.length];
  }

  return result;
}