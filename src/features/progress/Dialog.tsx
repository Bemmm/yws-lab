"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native <dialog>: focus trap, Escape to close, focus returns to the opener. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    }
  }, [open]);

  return (
    <dialog ref={ref} className="p-dialog" aria-labelledby="p-dialog-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {open ? (
        <>
          <h2 id="p-dialog-title">{title}</h2>
          {children ? <div className="mb-4 text-ink-2">{children}</div> : null}
          <div className="p-dialog-actions">{actions}</div>
        </>
      ) : null}
    </dialog>
  );
}
