"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type * as React from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmOptions {
  title: React.ReactNode;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` (default) styles the confirm button as destructive. */
  tone?: "danger" | "primary";
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

/** Design-system replacement for window.confirm: `const confirm = useConfirm(); if (await confirm({...})) ...` */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setState((prev) => {
          prev?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  function settle(ok: boolean) {
    state?.resolve(ok);
    setState(null);
  }

  const o = state?.options;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onClose={() => settle(false)} title={o?.title}>
        {o?.body ? <div className="text-ink-muted">{o.body}</div> : null}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" autoFocus onClick={() => settle(false)}>
            {o?.cancelLabel}
          </Button>
          <Button variant={o?.tone === "primary" ? "primary" : "danger"} onClick={() => settle(true)}>
            {o?.confirmLabel}
          </Button>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
