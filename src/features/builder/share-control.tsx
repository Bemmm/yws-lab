"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/Button";
import { ShareIcon } from "./icons";
import { useStrings } from "./strings";

export type ShareConfig = {
  initialToken: string | null;
  enable: (planId: string) => Promise<{ status: string; shareToken?: string | null }>;
  disable: (planId: string) => Promise<{ status: string }>;
};

const noopSubscribe = () => () => {};
function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

/** Public URL of a share token. */
export function shareUrl(origin: string, token: string): string {
  return `${origin}/p/${token}`;
}

/**
 * Share state machine + body: URL field, Copy, Stop access, and visible errors for enable/disable
 * (Papaya ignored failures and always cleared the token on stop).
 */
export function SharePanel({
  planId,
  share,
  token,
  onToken,
  autoFocusCreate = false,
}: {
  planId: string;
  share: ShareConfig;
  token: string | null;
  onToken: (token: string | null) => void;
  autoFocusCreate?: boolean;
}) {
  const t = useStrings();
  const s = t.program.share;
  const origin = useOrigin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (copiedTimer.current && clearTimeout(copiedTimer.current)), []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await share.enable(planId);
      if (res.status === "ok" && res.shareToken) onToken(res.shareToken);
      else setError(s.enableFailed);
    } catch {
      setError(s.enableFailed);
    }
    setBusy(false);
  }
  async function stop() {
    setBusy(true);
    setError(null);
    try {
      const res = await share.disable(planId);
      // Only clear the token when the server confirmed it: otherwise the link is still live.
      if (res.status === "ok") onToken(null);
      else setError(s.disableFailed);
    } catch {
      setError(s.disableFailed);
    }
    setBusy(false);
  }
  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(shareUrl(origin, token));
      setCopied(true);
      setError(null);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(s.copyFailed);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {token ? (
        <>
          <p className="text-caption text-ink-muted">{s.hint}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label={s.label}
              value={shareUrl(origin, token)}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-sm bg-bg-page px-3 text-caption text-ink-2"
            />
            <Button size="sm" onClick={copy}>
              {copied ? s.copied : s.copy}
            </Button>
          </div>
          <div>
            <Button size="sm" variant="danger" disabled={busy} onClick={stop}>
              {s.stop}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-caption text-ink-muted">{s.none}</p>
          <div>
            <Button size="sm" disabled={busy} onClick={create} autoFocus={autoFocusCreate}>
              {s.create}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-caption text-red-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** Editor header control: first click issues the link (idempotent on the server) and opens the popover. */
export function ShareControl({ planId, share }: { planId: string; share: ShareConfig }) {
  const t = useStrings();
  const [token, setToken] = useState<string | null>(share.initialToken);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const timer = setTimeout(() => document.addEventListener("pointerdown", onPointer), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onToggle() {
    if (token || open) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    setInitialError(false);
    let ok = false;
    try {
      const res = await share.enable(planId);
      if (res.status === "ok" && res.shareToken) {
        setToken(res.shareToken);
        ok = true;
      }
    } catch {
      /* shown below */
    }
    setBusy(false);
    setInitialError(!ok);
    setOpen(true);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`y-btn y-btn-sm ${token ? "y-btn-primary" : "y-btn-secondary"}`}
      >
        <ShareIcon size={16} />
        {t.program.share.button}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t.program.share.button}
          className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-bg-card p-4 shadow-float ring-1 ring-line sm:left-auto sm:right-0"
        >
          <SharePanel planId={planId} share={share} token={token} onToken={setToken} />
          {initialError && !token && (
            <p role="alert" className="mt-3 text-caption text-red-ink">
              {t.program.share.enableFailed}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
