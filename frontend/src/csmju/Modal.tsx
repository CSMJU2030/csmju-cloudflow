"use client";

import { useEffect, useId } from "react";
import { CloseIcon } from "./icons";
import { dangerButtonClass, secondaryButtonClass } from "./ui";

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="fade-slide-up relative w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h3 id={titleId} className="font-display text-headline-md text-on-surface">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-lg p-1.5 text-outline transition-colors hover:bg-surface-variant/50 hover:text-on-surface"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDeleteModal({
  title,
  message,
  blockedReason,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  /** When set, deletion is not allowed and this explains why. */
  blockedReason?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-body-md text-on-surface-variant">{message}</p>
      {blockedReason && (
        <p className="mt-4 rounded-lg bg-error-container px-4 py-3 text-label-md text-on-error-container">
          {blockedReason}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className={secondaryButtonClass}>
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={Boolean(blockedReason)}
          className={dangerButtonClass}
        >
          ลบ
        </button>
      </div>
    </Modal>
  );
}
