/**
 *
 * Renders the URL shortening form with:
 *   - URL input (the long URL to shorten)
 *   - Format selector (short vs branded radio buttons)
 *   - Optional custom shortcode input (toggle to reveal)
 *   - Submit button with limit display
 *
 * The branded option is disabled when the user has no subdomain.
 * Client-side validation runs before submission for instant feedback.
 * Server re-validates everything in the route action.
 */

import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { validateUrl } from "~/lib/url-validation";
import { validateCustomShortcode } from "~/lib/shortcode";

interface UrlCreationFormProps {
  subdomain: string | null;
  urlCount: number;
  maxUrls: number;
}

interface CreateActionData {
  success: boolean;
  error?: string;
  createdUrl?: {
    shortcode: string;
    subdomain: string | null;
    originalUrl: string;
    fullShortUrl: string;
  };
}

/**
 * TODO: Replace with your actual domain once purchased.
 * This is used only for display purposes in the form.
 */
import { SITE_DOMAIN } from "~/lib/constants";

const DISPLAY_DOMAIN = SITE_DOMAIN;


export function UrlCreationForm({
  subdomain,
  urlCount,
  maxUrls,
}: UrlCreationFormProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const isAtLimit = urlCount >= maxUrls;

  const [urlFormat, setUrlFormat] = useState<"short" | "branded">("short");
  const [useCustomShortcode, setUseCustomShortcode] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  /**
   * When subdomain is null and user somehow has "branded" selected
   * (shouldn't happen with disabled radio, but defensive), reset.
   */
  const effectiveFormat = subdomain ? urlFormat : "short";

  function handleFormatChange(event: React.ChangeEvent<HTMLInputElement>) {
    setUrlFormat(event.target.value as "short" | "branded");
  }

  function handleCustomToggle() {
    setUseCustomShortcode((prev) => !prev);
  }

  /**
   * Client-side validation before form submission.
   * If invalid, we prevent the default form submit and show the error.
   * If valid, we let the form submit naturally to the route action.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);

    // Validate URL
    const rawUrl = formData.get("originalUrl") as string;
    const urlValidation = validateUrl(rawUrl);

    if (!urlValidation.isValid) {
      event.preventDefault();
      setClientError(urlValidation.error);
      return;
    }

    // Validate custom shortcode if enabled
    if (useCustomShortcode) {
      const rawShortcode = formData.get("customShortcode") as string;

      if (!rawShortcode || rawShortcode.trim().length === 0) {
        event.preventDefault();
        setClientError("Custom shortcode is required when enabled.");
        return;
      }

      const shortcodeValidation = validateCustomShortcode(rawShortcode.trim());

      if (!shortcodeValidation.isValid) {
        event.preventDefault();
        setClientError(shortcodeValidation.error);
        return;
      }
    }

    // Clear any previous client error — form will submit normally
    setClientError(null);
  }

  if (isAtLimit) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <p>
          You've reached the limit of {maxUrls} URLs.
          Delete an existing URL to create a new one.
        </p>
      </div>
    );
  }

  return (
    <Form method="post" onSubmit={handleSubmit}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* --- URL Input --- */}
        <UrlInput disabled={isSubmitting} />

        {/* --- Format Selector --- */}
        <FormatSelector
          selectedFormat={effectiveFormat}
          subdomain={subdomain}
          onFormatChange={handleFormatChange}
        />

        {/* --- Custom Shortcode Toggle + Input --- */}
        <CustomShortcodeSection
          isEnabled={useCustomShortcode}
          onToggle={handleCustomToggle}
          disabled={isSubmitting}
        />

        {/* --- Hidden fields for the action --- */}
        <input type="hidden" name="urlFormat" value={effectiveFormat} />
        <input
          type="hidden"
          name="useCustomShortcode"
          value={useCustomShortcode ? "true" : "false"}
        />

        {/* --- Error Display --- */}
        {clientError && (
          <p>
            {clientError}
          </p>
        )}

        {/* --- Submit --- */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Shorten URL"}
          </button>
          <span>
            {urlCount} of {maxUrls} URLs used
          </span>
        </div>
      </div>
    </Form>
  );
}

// -----------------------------------------------
// Sub-components
// -----------------------------------------------

function UrlInput({ disabled }: { disabled: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <span style={{ fontWeight: "bold" }}>URL to shorten</span>
      <input
        type="text"
        name="originalUrl"
        placeholder="https://example.com/my-very-long-url"
        disabled={disabled}
      />
    </label>
  );
}

function FormatSelector({
  selectedFormat,
  subdomain,
  onFormatChange,
}: {
  selectedFormat: "short" | "branded";
  subdomain: string | null;
  onFormatChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const hasBrandedOption = subdomain !== null;

  return (
    <fieldset>
      <legend>
        URL format
      </legend>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="radio"
            name="formatRadio"
            value="short"
            checked={selectedFormat === "short"}
            onChange={onFormatChange}
          />
          <span>
            Short — <code>{DISPLAY_DOMAIN}/shortcode</code>
          </span>
        </label>

        <label>
          <input
            type="radio"
            name="formatRadio"
            value="branded"
            checked={selectedFormat === "branded"}
            onChange={onFormatChange}
            disabled={!hasBrandedOption}
          />
          <span>
            {hasBrandedOption ? (
              <>
                Branded — <code>{subdomain}.{DISPLAY_DOMAIN}/shortcode</code>
              </>
            ) : (
              "Branded — set up a subdomain first"
            )}
          </span>
        </label>
      </div>
    </fieldset>
  );
}

function CustomShortcodeSection({
  isEnabled,
  onToggle,
  disabled,
}: {
  isEnabled: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={onToggle}
          disabled={disabled}
        />
        <span>Use custom shortcode</span>
      </label>

      {isEnabled && (
        <div style={{ marginTop: "0.5rem" }}>
          <input
            type="text"
            name="customShortcode"
            placeholder="my-custom-code"
            disabled={disabled}
          />
          <p>
            Lowercase letters, numbers, and hyphens. Min 3 characters.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success display (used by the route after successful creation)
// ---------------------------------------------------------------------------

export function UrlCreatedSuccess({
  createdUrl,
}: {
  createdUrl: {
    shortcode: string;
    subdomain: string | null;
    originalUrl: string;
    fullShortUrl: string;
  };
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(createdUrl.fullShortUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <p>
        URL created!
      </p>

      <p>
        {createdUrl.originalUrl}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <code style={{ fontSize: "1.125rem" }}>{createdUrl.fullShortUrl}</code>
        <button
          type="button"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}