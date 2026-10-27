"use client";

import { useDraggable } from "@dnd-kit/core";
import { useMemo } from "react";
import { Tabs } from "@/components/Tabs";
import { ASANAS, type Asana, type AsanaLevel } from "./asana-manifest";
import type { DragData } from "./slot";
import { useAsanaAlt, useStrings } from "./strings";

const LEVELS: AsanaLevel[] = ["L1", "L2", "L3", "L4", "L5", "L6", "Other"];
export type LibraryTab = "all" | AsanaLevel;
const TABS: LibraryTab[] = ["all", ...LEVELS];

/** Catalog: heading with count, level filter (All, L1-L6, Other) and the image grid. Shared by the desktop aside and the mobile sheet. */
export function LibraryPanel({
  tab,
  onTab,
  onPick,
  notice,
}: {
  tab: LibraryTab;
  onTab: (t: LibraryTab) => void;
  onPick: (a: Asana) => void;
  /** Polite status line, e.g. "every slot is taken". */
  notice: string | null;
}) {
  const t = useStrings();
  const filtered = useMemo(() => (tab === "all" ? ASANAS : ASANAS.filter((a) => a.level === tab)), [tab]);
  const labels = TABS.map((k) => (k === "all" ? t.library.all : k === "Other" ? t.library.other : k));
  return (
    <>
      <header className="hidden shrink-0 px-4 pb-2 pt-4 lg:block">
        <p className="text-micro uppercase tracking-wider text-ink-muted">{t.library.eyebrow}</p>
        <h2 className="text-h3">
          {t.library.title} · {filtered.length}
        </h2>
      </header>
      <div className="shrink-0 px-3 pb-2 pt-1" aria-label={t.library.levels}>
        <Tabs items={labels} value={TABS.indexOf(tab)} onChange={(i) => onTab(TABS[i]!)} />
      </div>
      <p role="status" aria-live="polite" className={notice ? "mx-3 mb-2 rounded-sm bg-amber px-3 py-2 text-caption text-amber-ink" : "sr-only"}>
        {notice}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
          {filtered.map((a) => (
            <LibraryItem key={a.id} asana={a} onClick={() => onPick(a)} />
          ))}
        </div>
        {filtered.length === 0 && <p className="py-8 text-center text-caption text-ink-muted">{t.library.notFound}</p>}
      </div>
    </>
  );
}

function LibraryItem({ asana, onClick }: { asana: Asana; onClick: () => void }) {
  const t = useStrings();
  const altFor = useAsanaAlt();
  const alt = altFor(asana.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${asana.id}`,
    data: { source: "library", asanaId: asana.id, label: alt } satisfies DragData,
  });
  // Pointer drag only: Enter/Space must keep their native "click = add to the first free slot" meaning.
  const { onKeyDown: _onKeyDown, ...pointerListeners } = listeners ?? {};
  void _onKeyDown;
  const { role: _role, tabIndex: _tabIndex, "aria-roledescription": _rd, "aria-describedby": _db, ...safeAttributes } = attributes;
  void _role;
  void _tabIndex;
  void _rd;
  void _db;
  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={onClick}
      {...safeAttributes}
      {...pointerListeners}
      aria-label={alt}
      title={`${alt} — ${t.library.itemHint}`}
      className={`aspect-square cursor-grab [contain-intrinsic-size:100px] [content-visibility:auto] rounded-sm bg-bg-page p-1.5 hover:ring-2 hover:ring-ink active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local school-owned SVGs */}
      <img src={asana.src} alt="" width={88} height={88} draggable={false} loading="lazy" decoding="async" className="pointer-events-none h-full w-full select-none object-contain" />
    </button>
  );
}
