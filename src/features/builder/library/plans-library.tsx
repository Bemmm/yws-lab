"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/Card";
import { ConfirmProvider, useConfirm } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { useT } from "@/i18n/client";
import { format } from "@/i18n/format";
import { deletePlanAction, disableShareAction, duplicatePlanAction, enableShareAction } from "@/server/plans/actions";
import { DotsIcon } from "../icons";
import { SharePanel, type ShareConfig } from "../share-control";

export type LibraryItem = {
  id: string;
  title: string;
  previewSrcs: string[];
  setsLabel: string;
  asanasLabel: string;
  updatedLabel: string;
  shareToken: string | null;
};

const shareConfig: ShareConfig = {
  initialToken: null,
  enable: (id) => enableShareAction(id),
  disable: (id) => disableShareAction(id),
};

export function PlansLibrary({ items }: { items: LibraryItem[] }) {
  const t = useT().plans;
  const [error, setError] = useState(false);
  return (
    <ConfirmProvider>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-soft px-4 py-3 text-red-ink">
          {t.actionFailed}
        </p>
      )}
      <ul aria-label={t.plansList} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="flex">
            <PlanCard item={item} onError={setError} />
          </li>
        ))}
      </ul>
    </ConfirmProvider>
  );
}

function PreviewStrip({ srcs }: { srcs: string[] }) {
  const cells = Array.from({ length: 4 }, (_, i) => srcs[i] ?? null);
  return (
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-md bg-line" aria-hidden="true">
      {cells.map((src, i) =>
        src ? (
          <div key={i} className="aspect-square bg-asana-bg">
            {/* eslint-disable-next-line @next/next/no-img-element -- local school-owned SVGs */}
            <img src={src} alt="" className="h-full w-full select-none object-contain p-2" draggable={false} />
          </div>
        ) : (
          <div key={i} className="flex aspect-square items-center justify-center bg-bg-page">
            <span className="size-5 rounded-sm border-2 border-dashed border-toggle-off" />
          </div>
        ),
      )}
    </div>
  );
}

function PlanCard({ item, onError }: { item: LibraryItem; onError: (failed: boolean) => void }) {
  const t = useT().plans;
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(item.shareToken);
  const [linkOpen, setLinkOpen] = useState(false);
  const title = item.title.trim() || t.untitled;

  function run(action: () => Promise<{ status: string }>) {
    onError(false);
    startTransition(async () => {
      try {
        const res = await action();
        if (res.status !== "ok") onError(true);
      } catch {
        onError(true);
      }
      router.refresh();
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: format(t.deleteTitle, { title }),
      body: t.deleteBody,
      confirmLabel: t.deleteConfirm,
      cancelLabel: t.cancel,
    });
    if (ok) run(() => deletePlanAction(item.id));
  }

  return (
    <Card as="article" className={`relative w-full gap-3 focus-within:outline focus-within:outline-[3px] focus-within:outline-focus ${pending ? "opacity-60" : ""}`}>
      <PreviewStrip srcs={item.previewSrcs} />
      <h2 className="line-clamp-2 text-h3">
        {/* stretched link: the whole card opens the editor */}
        <Link href={`/plans/${item.id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl">
          {title}
        </Link>
      </h2>
      <p className="text-caption text-ink-muted tabular-nums">
        {item.setsLabel} · {item.asanasLabel}
      </p>
      <div className="mt-auto flex items-center gap-2 text-caption text-ink-muted">
        {token && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-mint px-3 py-1 text-micro text-mint-ink">
            <span className="size-1.5 rounded-full bg-mint-ink" aria-hidden="true" />
            {t.shared}
          </span>
        )}
        <span className="ml-auto">{item.updatedLabel}</span>
      </div>
      <div className="absolute right-3 top-3 z-10">
        <ActionMenu
          label={format(t.menuOpen, { title })}
          previewHref={`/plans/${item.id}/preview`}
          onDuplicate={() => run(() => duplicatePlanAction(item.id))}
          onLink={() => setLinkOpen(true)}
          onDelete={onDelete}
        />
      </div>
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} title={format(t.linkTitle, { title })}>
        <SharePanel planId={item.id} share={shareConfig} token={token} onToken={(next) => { setToken(next); router.refresh(); }} autoFocusCreate />
        <div className="flex justify-end">
          <button type="button" className="y-btn y-btn-ghost y-btn-sm" onClick={() => setLinkOpen(false)}>
            {t.close}
          </button>
        </div>
      </Dialog>
    </Card>
  );
}

function ActionMenu({
  label,
  previewHref,
  onDuplicate,
  onLink,
  onDelete,
}: {
  label: string;
  previewHref: string;
  onDuplicate: () => void;
  onLink: () => void;
  onDelete: () => void;
}) {
  const t = useT().plans;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    const timer = setTimeout(() => document.addEventListener("pointerdown", onPointer), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (!items.length) return;
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]!.focus();
  }
  const item = "flex min-h-11 w-full items-center rounded-sm px-3 text-left text-body hover:bg-bg-page";

  return (
    <div ref={ref} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 items-center justify-center rounded-pill bg-bg-card/90 text-ink-2 ring-1 ring-line hover:text-ink"
      >
        <DotsIcon />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md bg-bg-card p-1 shadow-float ring-1 ring-line">
          <Link role="menuitem" href={previewHref} target="_blank" rel="noopener" className={item} onClick={() => close(false)}>
            {t.menuPreview}
          </Link>
          <button type="button" role="menuitem" className={item} onClick={() => { close(false); onDuplicate(); }}>
            {t.menuDuplicate}
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { close(false); onLink(); }}>
            {t.menuLink}
          </button>
          <button type="button" role="menuitem" className={`${item} text-red-ink`} onClick={() => { close(false); onDelete(); }}>
            {t.menuDelete}
          </button>
        </div>
      )}
    </div>
  );
}
