/**
 * dashboard.qr.new.tsx — /dashboard/qr/new route
 *
 * QR code generation page.
 *
 * Two entry points:
 *   - /dashboard/qr/new         (URL selector dropdown)
 *   - /dashboard/qr/new?urlId=5 (pre-selected URL)
 *
 * Flow:
 *   1. User configures settings (URL, type, colors, size, EC)
 *   2. Clicks "Generate Preview" → QR generated client-side via Canvas
 *   3. Sees preview → clicks "Save to Library"
 *   4. Client submits base64 PNG + metadata to this route's action
 *   5. Action: resolves encoded URL, uploads PNG to R2, saves to D1
 *
 * Why client-side generation?
 *   The `qrcode` npm package needs canvas to render PNGs.
 *   Cloudflare Workers don't have canvas. Browsers do.
 *   So we generate in the browser, then send the image to the server.
 */

import { useState } from "react";
import { getAuth } from "@clerk/react-router/ssr.server";
import { RedirectToSignIn } from "@clerk/react-router";
import { data, Link } from "react-router";
import type { Route } from "./+types/dashboard.qr.new";
import { QrCustomizationForm } from "~/components/QR/QRCustomizationForm";
import type { UrlOption } from "~/components/QR/QRCustomizationForm";
import { QrPreview } from "~/components/QR/QrPreview";
import {
  generateQrDataUrl,
  dataUrlToBytes,
} from "~/lib/qr-generation";
import type { QrCustomization } from "~/lib/qr-generation";
import { uploadQrImage } from "~/lib/qr-storage";
import { resolveShortestUrl } from "~/lib/qr-shortest";
import { SITE_DOMAIN } from "~/lib/constants";
import { getTierPermissions } from "~/lib/tier";

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    const permissions = getTierPermissions("free");
    return {
      authenticated: false as const,
      urls: [],
      qrCount: 0,
      preselectedUrlId: null,
      maxQrCodes: permissions.maxQrCodes,
      maxUrls: permissions.maxUrls,
    };
  }

  const db = args.context.cloudflare.env.qr_url_db;

  /** Fetch user's plan for tier-aware limits */
  const userRow = await db
    .prepare("SELECT plan FROM users WHERE clerk_user_id = ?")
    .bind(userId)
    .first<{ plan: string }>();

  const permissions = getTierPermissions(userRow?.plan);

  /** Fetch user's URLs for the selector dropdown */
  const urlRows = await db
    .prepare(
      `SELECT id, shortcode, original_url, subdomain
       FROM urls
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<{ id: number; shortcode: string; original_url: string; subdomain: string | null }>();

  /** Count existing QR codes for limit display */
  const qrCountRow = await db
    .prepare("SELECT COUNT(*) as count FROM qr_codes WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();

  /** Read pre-selected URL ID from query params */
  const url = new URL(args.request.url);
  const urlIdParam = url.searchParams.get("urlId");
  const preselectedUrlId = urlIdParam ? Number(urlIdParam) : null;

  return {
    authenticated: true as const,
    urls: urlRows.results ?? [],
    qrCount: qrCountRow?.count ?? 0,
    preselectedUrlId,
    maxQrCodes: permissions.maxQrCodes,
    maxUrls: permissions.maxUrls,
  };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action(args: Route.ActionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return data({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const formData = await args.request.formData();
  const intent = formData.get("intent") as string;

  if (intent !== "save-qr") {
    return data({ success: false, error: "Unknown action." }, { status: 400 });
  }

  const db = args.context.cloudflare.env.qr_url_db;
  const r2 = args.context.cloudflare.env.QR_IMAGES;

  // --- Fetch user's plan for tier-aware limits ---
  const userRow = await db
    .prepare("SELECT plan FROM users WHERE clerk_user_id = ?")
    .bind(userId)
    .first<{ plan: string }>();

  const permissions = getTierPermissions(userRow?.plan);

  // --- Extract form fields ---
  const urlId = Number(formData.get("urlId"));
  const urlType = (formData.get("urlType") as string) ?? "shortest";
  const customizationJson = (formData.get("customizationJson") as string) ?? "{}";
  const imageDataUrl = (formData.get("imageDataUrl") as string) ?? "";

  // --- Validate image data ---
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/png")) {
    return data({ success: false, error: "Invalid image data." }, { status: 400 });
  }

  // --- Enforce QR code limit ---
  const qrCountRow = await db
    .prepare("SELECT COUNT(*) as count FROM qr_codes WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();

  const currentQrCount = qrCountRow?.count ?? 0;

  if (currentQrCount >= permissions.maxQrCodes) {
    return data(
      { success: false, error: `You've reached the limit of ${permissions.maxQrCodes} QR codes.` },
      { status: 403 }
    );
  }

  // --- Verify URL ownership ---
  const urlRecord = await db
    .prepare(
      `SELECT id, shortcode, original_url, subdomain
       FROM urls WHERE id = ? AND user_id = ?`
    )
    .bind(urlId, userId)
    .first<{ id: number; shortcode: string; original_url: string; subdomain: string | null }>();

  if (!urlRecord) {
    return data({ success: false, error: "URL not found." }, { status: 404 });
  }

  // --- Resolve the encoded URL based on type ---
  let encodedUrl: string;

  if (urlType === "original") {
    encodedUrl = urlRecord.original_url;
  } else if (urlType === "branded") {
    if (!urlRecord.subdomain) {
      return data({
        success: false,
        error: "This URL doesn't have a branded format.",
      }, { status: 400 });
    }
    encodedUrl = `${urlRecord.subdomain}.${SITE_DOMAIN}/${urlRecord.shortcode}`;
  } else {
    // "shortest" — may auto-create a short URL
    const urlCountRow = await db
      .prepare("SELECT COUNT(*) as count FROM urls WHERE user_id = ?")
      .bind(userId)
      .first<{ count: number }>();

    const shortestResult = await resolveShortestUrl(
      db,
      userId,
      urlRecord,
      urlCountRow?.count ?? 0,
      permissions.maxUrls
    );

    if (shortestResult.error) {
      return data({ success: false, error: shortestResult.error }, { status: 400 });
    }

    encodedUrl = shortestResult.encodedUrl;
  }

  // --- Upload PNG to R2 ---
  const pngBytes = dataUrlToBytes(imageDataUrl);
  const storagePath = await uploadQrImage(r2, userId, pngBytes);

  // --- Save metadata to D1 ---
  await db
    .prepare(
      `INSERT INTO qr_codes (user_id, url_id, url_type, encoded_url, storage_path, customization)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(userId, urlId, urlType, encodedUrl, storagePath, customizationJson)
    .run();

  return data({ success: true });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardQrNew({
  loaderData,
}: Route.ComponentProps) {
  if (!loaderData.authenticated) {
    return <RedirectToSignIn />;
  }

  const { urls, qrCount, preselectedUrlId, maxQrCodes } = loaderData;

  /** Client-side state for the generated QR preview */
  const [previewState, setPreviewState] = useState<{
    dataUrl: string;
    encodedUrl: string;
    urlType: string;
    urlId: number;
    customizationJson: string;
  } | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const isAtLimit = qrCount >= maxQrCodes;

  /**
   * Handles the "Generate Preview" button.
   * Runs entirely client-side — uses browser Canvas via qrcode package.
   */
  async function handleGenerate(
    urlId: number,
    urlType: string,
    customization: QrCustomization
  ) {
    setIsGenerating(true);
    setGenerateError(null);

    try {
      const selectedUrl = urls.find((u) => u.id === urlId);

      if (!selectedUrl) {
        setGenerateError("URL not found.");
        return;
      }

      /**
       * Determine which URL to encode in the QR code.
       * For preview purposes, we use the best guess.
       * The server re-resolves this authoritatively on save
       * (especially for "shortest" which may auto-create a URL).
       */
      let encodedUrl: string;

      if (urlType === "original") {
        encodedUrl = selectedUrl.original_url;
      } else if (urlType === "branded" && selectedUrl.subdomain) {
        encodedUrl = `${selectedUrl.subdomain}.${SITE_DOMAIN}/${selectedUrl.shortcode}`;
      } else {
        // shortest or branded-without-subdomain fallback
        encodedUrl = `${SITE_DOMAIN}/${selectedUrl.shortcode}`;
      }

      const dataUrl = await generateQrDataUrl(encodedUrl, customization);

      setPreviewState({
        dataUrl,
        encodedUrl,
        urlType,
        urlId,
        customizationJson: JSON.stringify(customization),
      });
    } catch (err) {
      setGenerateError("Failed to generate QR code. Please try again.");
      console.error("QR generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  }

  // Map URLs to the format expected by the form component
  const urlOptions: UrlOption[] = urls.map((u) => ({
    id: u.id,
    shortcode: u.shortcode,
    originalUrl: u.original_url,
    subdomain: u.subdomain,
  }));

  return (
    <div style={{ padding: "2rem", maxWidth: "600px" }}>
      <Link to="/dashboard" style={{ color: "#2563eb" }}>
        &larr; Back to Dashboard
      </Link>

      <h1 style={{ marginTop: "1rem" }}>Generate QR Code</h1>

      {isAtLimit && (
        <p style={{ color: "#dc2626", marginBottom: "1rem" }}>
          You've reached the limit of {maxQrCodes} QR codes.
          Delete an existing QR code to create a new one.
        </p>
      )}

      <p style={{ color: "#6b7280", marginBottom: "1rem" }}>
        {qrCount} of {maxQrCodes} QR codes used
      </p>

      {!isAtLimit && (
        <QrCustomizationForm
          urls={urlOptions}
          preselectedUrlId={preselectedUrlId}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      )}

      {generateError && (
        <p style={{ color: "#dc2626", marginTop: "1rem" }} role="alert">
          {generateError}
        </p>
      )}

      {previewState && !isAtLimit && (
        <QrPreview
          dataUrl={previewState.dataUrl}
          encodedUrl={previewState.encodedUrl}
          urlType={previewState.urlType}
          urlId={previewState.urlId}
          customizationJson={previewState.customizationJson}
        />
      )}
    </div>
  );
}