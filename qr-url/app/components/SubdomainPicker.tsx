/**
 * SubdomainPicker component.
 *
 * Three modes, all orchestrated from the top-level SubdomainPicker:
 *   1. "claim"   — user has no subdomain yet (SubdomainClaimView)
 *   2. "read"    — user has a subdomain, showing it with a "Change" button (SubdomainReadView)
 *   3. "edit"    — user clicked "Change", inline edit form is visible (SubdomainEditView)
 *
 * Uses useFetcher instead of <Form> so the submission doesn't trigger
 * a full page navigation. The dashboard loader re-runs automatically
 * after the fetcher completes, updating the displayed subdomain.
 *
 * If the user has branded QR codes, changing the subdomain will make
 * those QR PNGs stale (they encode the old subdomain in the image and
 * can't be updated server-side). We show a modal warning BEFORE
 * submitting so the user can make an informed decision.
 */

import { useState } from "react";
import { useFetcher } from "react-router";
import {
  validateSubdomainFormat,
  cleanSubdomain,
} from "~/lib/subdomain-validation";
import { SITE_DOMAIN } from "~/lib/constants";
import { Modal } from "~/components/layout/Modal";
import styles from "./SubdomainPicker.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubdomainPickerProps {
  currentSubdomain: string | null;
  /** Number of saved QR codes with url_type === 'branded'. */
  brandedQrCount: number;
}

interface SubdomainClaimViewProps {
  brandedQrCount: number;
}

interface SubdomainReadViewProps {
  currentSubdomain: string;
  onEditClick: () => void;
}

interface SubdomainEditViewProps {
  currentSubdomain: string;
  brandedQrCount: number;
  onCancelEdit: () => void;
}

interface SubdomainFormProps {
  currentSubdomain: string | null;
  brandedQrCount: number;
}

/**
 * The shape of the data returned by the dashboard action
 * when processing a subdomain submission.
 * Matches what we return from handleSetSubdomain in dashboard.tsx.
 */
interface SubdomainActionData {
  intent: "set-subdomain";
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SubdomainPicker({
  currentSubdomain,
  brandedQrCount,
}: SubdomainPickerProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (!currentSubdomain) {
    return <SubdomainClaimView brandedQrCount={brandedQrCount} />;
  }

  if (isEditing) {
    return (
      <SubdomainEditView
        currentSubdomain={currentSubdomain}
        brandedQrCount={brandedQrCount}
        onCancelEdit={() => setIsEditing(false)}
      />
    );
  }

  return (
    <SubdomainReadView
      currentSubdomain={currentSubdomain}
      onEditClick={() => setIsEditing(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// View components
// ---------------------------------------------------------------------------

function SubdomainClaimView({ brandedQrCount }: SubdomainClaimViewProps) {
  return (
    <section className={styles.subdomain_section}>
      <h2>Subdomain</h2>
      <p>You haven't picked a subdomain yet.</p>
      <p>
        A subdomain lets you create branded short URLs like{" "}
        <strong>yourname.{SITE_DOMAIN}/link</strong>
      </p>
      <SubdomainForm currentSubdomain={null} brandedQrCount={brandedQrCount} />
    </section>
  );
}

function SubdomainReadView({
  currentSubdomain,
  onEditClick,
}: SubdomainReadViewProps) {
  return (
    <div className={styles.subdomain_container}>
      <h2>Your Subdomain</h2>
      <p>
        <strong>{currentSubdomain}</strong>.{SITE_DOMAIN}
      </p>
      <button type="button" onClick={onEditClick}>
        Change subdomain
      </button>
    </div>
  );
}

function SubdomainEditView({
  currentSubdomain,
  brandedQrCount,
  onCancelEdit,
}: SubdomainEditViewProps) {
  return (
    <div className={styles.subdomain_container}>
      <h2>Edit Subdomain</h2>
      <SubdomainForm
        currentSubdomain={currentSubdomain}
        brandedQrCount={brandedQrCount}
      />
      <button type="button" onClick={onCancelEdit}>
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form component (shared between claim and edit views)
// ---------------------------------------------------------------------------

function SubdomainForm({
  currentSubdomain,
  brandedQrCount,
}: SubdomainFormProps) {
  const fetcher = useFetcher<SubdomainActionData>();
  const [clientError, setClientError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingSubdomain, setPendingSubdomain] = useState<string | null>(null);

  const isSubmitting = fetcher.state !== "idle";
  const serverError =
    fetcher.data && !fetcher.data.success ? fetcher.data.error : null;

  /**
   * Client-side validation runs on submit, before sending to the server.
   * If the user has branded QR codes, we intercept here to show the
   * modal warning before proceeding. If they have none, we submit directly.
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

    setClientError(null);

    // If the user has branded QR codes, warn them before proceeding.
    // QR PNGs encode the subdomain at generation time and can't be
    // updated server-side — they'll need to be manually regenerated.
    if (brandedQrCount > 0) {
      setPendingSubdomain(cleaned);
      setIsModalOpen(true);
      return;
    }

    submitSubdomain(cleaned);
  }

  function submitSubdomain(subdomain: string) {
    fetcher.submit(
      { intent: "set-subdomain", subdomain },
      { method: "post" }
    );
  }

  function handleModalConfirm() {
    setIsModalOpen(false);

    if (pendingSubdomain !== null) {
      submitSubdomain(pendingSubdomain);
      setPendingSubdomain(null);
    }
  }

  function handleModalCancel() {
    setIsModalOpen(false);
    setPendingSubdomain(null);
  }

  const displayedError = clientError ?? serverError ?? null;

  return (
    <>
      <Modal
        isOpen={isModalOpen}
        title="Change subdomain?"
        confirmLabel="Yes, change it"
        cancelLabel="Keep current"
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
      >
        <p>
          Your URLs will be migrated to the new subdomain automatically.
        </p>
        <p>
          However,{" "}
          {brandedQrCount === 1
            ? "1 branded QR code encodes"
            : `${brandedQrCount} branded QR codes encode`}{" "}
          the old subdomain in{" "}
          {brandedQrCount === 1 ? "its" : "their"} image and cannot be
          updated automatically.{" "}
          {brandedQrCount === 1 ? "It" : "They"} will need to be deleted
          and regenerated manually from your dashboard.
        </p>
      </Modal>

      <form onSubmit={handleSubmit}>
        <div>
          <input
            type="text"
            name="subdomain"
            defaultValue={currentSubdomain ?? ""}
            placeholder="your-name"
            aria-label="Subdomain"
            aria-invalid={displayedError ? "true" : undefined}
            disabled={isSubmitting}
          />
          <span>.{SITE_DOMAIN}</span>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save"}
          </button>
        </div>

        {displayedError && (
          <p role="alert">
            {displayedError}
          </p>
        )}
      </form>
    </>
  );
}
