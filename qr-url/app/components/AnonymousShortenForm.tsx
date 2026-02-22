/**
 * A stripped-down URL shortening form for visitors without an account.
 * Compared to the authenticated form:
 *   - No format selector (always short format)
 *   - No custom shortcode option (always auto-generated)
 *   - Includes Turnstile captcha widget
 *   - Shows remaining daily quota
 *
 * The Turnstile widget renders a hidden challenge. When the user passes
 * (usually invisible — no clicking required), it generates a token that
 * gets submitted with the form as a hidden input "cf-turnstile-response".
 * The server verifies this token before creating the URL.
 */

import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { Turnstile } from "@marsidev/react-turnstile";
import { validateUrl } from "~/lib/url-validation";


interface AnonymousShortenFormProps {
  turnstileSiteKey: string;
  remaining: number;
}


import { SITE_DOMAIN } from "~/lib/constants";

const DISPLAY_DOMAIN = SITE_DOMAIN;


export function AnonymousShortenForm({
  turnstileSiteKey,
  remaining,
}: AnonymousShortenFormProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [clientError, setClientError] = useState<string | null>(null);

  if (remaining <= 0) {
    return <DailyLimitReached />;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const rawUrl = formData.get("originalUrl") as string;
    const urlValidation = validateUrl(rawUrl);

    if (!urlValidation.isValid) {
      event.preventDefault();
      setClientError(urlValidation.error);
      return;
    }

    /**
     * Check that Turnstile has produced a token.
     * The widget sets a hidden input named "cf-turnstile-response".
     * If it's empty, the challenge hasn't completed yet.
     */
    const turnstileToken = formData.get("cf-turnstile-response") as string;

    if (!turnstileToken) {
      event.preventDefault();
      setClientError("Please wait for the captcha to complete.");
      return;
    }

    setClientError(null);
    // Let the form submit naturally to the route action
  }

  return (
    <Form method="post" onSubmit={handleSubmit}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* --- URL Input --- */}
        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
        >
          <span>Paste a long URL</span>
          <input
            type="text"
            name="originalUrl"
            placeholder="https://example.com/my-very-long-url"
            disabled={isSubmitting}
            style={{ padding: "0.5rem", fontSize: "1rem", width: "100%" }}
          />
        </label>

        {/* --- Turnstile Widget --- */}
        <Turnstile
          siteKey={turnstileSiteKey}
          options={{
            theme: "light",
            size: "normal",
          }}
        />

        {/* --- Error --- */}
        {clientError && (
          <p role="alert">
            {clientError}
          </p>
        )}

        {/* --- Submit --- */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Shortening..." : "Shorten URL"}
          </button>
          <span>
            {remaining} of 5 free URLs remaining today
          </span>
        </div>
      </div>
    </Form>
  );
}

// 
// Success display
//

export function AnonymousUrlCreated({
  fullShortUrl,
  originalUrl,
  remaining,
}: {
  fullShortUrl: string;
  originalUrl: string;
  remaining: number;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(fullShortUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <p>
        URL shortened!
      </p>

      <p>
        {originalUrl}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <code>{fullShortUrl}</code>
        <button
          type="button"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <p>
        This link expires in 365 days. Sign up for permanent links.
      </p>

      {remaining > 0 && (
        <p>
          {remaining} free URLs remaining today.
        </p>
      )}
    </div>
  );
}

// 
// Limit reached state
// 

function DailyLimitReached() {
  return (
    <div>
      <p>
        Daily limit reached
      </p>
      <p>
        You've used all 5 free URLs for today.
        Sign up for a free account to get 10 permanent URLs with analytics.
      </p>
    </div>
  );
}