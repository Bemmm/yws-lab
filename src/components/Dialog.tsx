"use client";

import { useEffect, useId, useRef } from "react";
import type * as React from "react";
import { cx } from "./cx";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** Modal dialog on the native <dialog>: focus is trapped inside, Esc closes, focus returns to the opener. */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "m-auto w-[min(92vw,28rem)] rounded-xl bg-bg-card p-0 text-ink shadow-float backdrop:bg-scrim",
        className,
      )}
    >
      {open ? (
        <div className="flex flex-col gap-3 p-6">
          <h2 id={titleId} className="text-h2">
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
