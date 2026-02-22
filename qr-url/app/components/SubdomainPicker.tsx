/**
 * SubdomainPicker component.
 *
 * Two modes:
 *   1. "claim" — user has no subdomain yet, show input + submit
 *   2. "display" — user has a subdomain, show it with an "Edit" button
 *      that switches to an inline edit form
 *
 * Uses useFetcher instead of <Form> so the submission doesn't trigger
 * a full page navigation. The dashboard loader re-runs automatically
 * after the fetcher completes, updating the displayed subdomain.
 *
 * The edit mode includes a warning that existing branded URLs stay
 * on the old subdomain. This is important — changing your subdomain
 * doesn't retroactively update URLs you've already created.
 */

import { useState } from "react";
import { useFetcher } from "react-router";
import {
  validateSubdomainFormat,
  cleanSubdomain,
} from "~/lib/subdomain-validation";
import { SITE_DOMAIN } from "~/lib/constants";

interface SubdomainPickerProps {
  currentSubdomain: string | null;
}

/**
 * The shape of the data returned by the dashboard action
 * when processing a subdomain submission.
 * Matches what we return from the action in dashboard.tsx.
 */
interface SubdomainActionData {
  intent: "set-subdomain";
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SubdomainPicker({ currentSubdomain }: SubdomainPickerProps) {
  if (currentSubdomain) {
    return <SubdomainDisplay currentSubdomain={currentSubdomain} />;
  }

  return (
    <section>
      <h2>Subdomain</h2>
      <p>You haven't picked a subdomain yet.</p>
      <p>
        A subdomain lets you create branded short URLs like{" "}
        <strong>yourname.{SITE_DOMAIN}/link</strong>
      </p>
      <SubdomainForm currentSubdomain={null} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Display mode (has subdomain, with edit toggle)
// ---------------------------------------------------------------------------

function SubdomainDisplay({
  currentSubdomain,
}: {
  currentSubdomain: string;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <section>
        <h2>Edit Subdomain</h2>
        <p>
          Existing branded URLs will stay on{" "}
          <strong>{currentSubdomain}.{SITE_DOMAIN}</strong> — they won't
          move to the new subdomain.
        </p>
        <SubdomainForm currentSubdomain={currentSubdomain} />
        <button
          type="button"
          onClick={() => setIsEditing(false)}
        >
          Cancel
        </button>
      </section>
    );
  }

  return (
    <section>
      <h2>Your Subdomain</h2>
      <p>
        <strong>{currentSubdomain}</strong>.{SITE_DOMAIN}
      </p>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        style={{ marginTop: "0.5rem", cursor: "pointer" }}
      >
        Change subdomain
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Form (shared between claim and edit)
// ---------------------------------------------------------------------------

function SubdomainForm({
  currentSubdomain,
}: {
  currentSubdomain: string | null;
}) {
  const fetcher = useFetcher<SubdomainActionData>();
  const [clientError, setClientError] = useState<string | null>(null);

  const isSubmitting = fetcher.state !== "idle";
  const serverError =
    fetcher.data && !fetcher.data.success ? fetcher.data.error : null;

  /**
   * Client-side validation runs on submit, before sending to the server.
   * This catches obvious format issues instantly (no round trip).
   * The server re-validates everything — client validation is just UX.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const rawSubdomain = formData.get("subdomain") as string;
    const cleaned = cleanSubdomain(rawSubdomain);

    const validation = validateSubdomainFormat(cleaned);

    if (!validation.isValid) {
      setClientError(validation.error);
      return;
    }

    // Clear client error and submit to the server
    setClientError(null);
    fetcher.submit(
      { intent: "set-subdomain", subdomain: cleaned },
      { method: "post" }
    );
  }

  const displayedError = clientError ?? serverError ?? null;

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="text"
          name="subdomain"
          defaultValue={currentSubdomain ?? ""}
          placeholder="your-name"
          aria-label="Subdomain"
          aria-invalid={displayedError ? "true" : undefined}
          disabled={isSubmitting}/>
        <span>.{SITE_DOMAIN}</span>
        <button type="submit" disabled={isSubmitting} style={{ cursor: "pointer" }}>
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>

      {displayedError && (
        <p role="alert">
          {displayedError}
        </p>
      )}
    </form>
  );
}