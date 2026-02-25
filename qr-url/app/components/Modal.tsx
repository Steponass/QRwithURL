/**
 * Modal.tsx
 *
 * Reusable confirmation modal. Renders a dialog overlay with a title,
 * body content (via children), and confirm/cancel buttons.
 *
 * Usage:
 *   <Modal
 *     isOpen={showModal}
 *     title="Are you sure?"
 *     confirmLabel="Yes, proceed"
 *     cancelLabel="Cancel"
 *     onConfirm={handleConfirm}
 *     onCancel={handleCancel}
 *   >
 *     <p>This action cannot be undone.</p>
 *   </Modal>
 *
 * Accessibility:
 *   - Uses the native <dialog> element for correct focus trapping
 *     and screen reader announcements
 *   - aria-modal tells screen readers this is a modal dialog
 *   - aria-labelledby links the title to the dialog role
 */

import { useEffect, useRef } from "react";

interface ModalProps {
  isOpen: boolean;
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  title,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync the open/closed state with the native <dialog> API.
  // showModal() enables the ::backdrop pseudo-element and focus trapping.
  // close() removes both.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    }

    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Allow closing by pressing Escape (native <dialog> behaviour).
  // We intercept it to call onCancel so the parent state stays in sync.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    function handleCancel(event: Event) {
      event.preventDefault();
      onCancel();
    }

    dialog.addEventListener("cancel", handleCancel);

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [onCancel]);

  return (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">{title}</h2>

      <div>{children}</div>

      <div>
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}