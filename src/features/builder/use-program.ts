"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asana } from "./asana-manifest";
import { createAutosaver, type Autosaver, type SaveResult, type SaveState } from "./autosave";
import {
  opAddScheduleRow,
  opAddSession,
  opAddToFirstEmpty,
  opClearProgram,
  opMoveSessionBy,
  opMoveSlot,
  opMoveSlotBy,
  opRemoveScheduleRow,
  opRemoveSession,
  opRenameScheduleRow,
  opReorderSessions,
  opSetScheduleCell,
  opSetScheduleDays,
  opSetScheduleEnabled,
  opSetSegments,
  opSetSlot,
  opSetSlotColor,
  opSetSlotSide,
  opSetSlotsCount,
  type Program,
  type Segment,
  type SlotColor,
  type SlotSide,
} from "./model";

export * from "./model";
export type { SaveResult, SaveState } from "./autosave";

export type UseProgramOptions = {
  /** Server-loaded program (the editor always runs in server mode). */
  initial: Program;
  /** Persists the full document; the wiring layer attaches the last known version. */
  save: (program: Program) => Promise<SaveResult>;
  /** Default title for new sets, e.g. "Сет 3" (localized by the caller). */
  setTitle: (n: number) => string;
};

/** Editor state: the program document plus the autosave lifecycle. All edits are pure ops from model.ts. */
export function useProgram({ initial, save, setTitle: defaultSetTitle }: UseProgramOptions) {
  const [program, setProgram] = useState<Program>(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [retrying, setRetrying] = useState(false);

  const saveRef = useRef(save);
  const setTitleRef = useRef(defaultSetTitle);
  useEffect(() => {
    saveRef.current = save;
    setTitleRef.current = defaultSetTitle;
  }, [save, defaultSetTitle]);

  const saverRef = useRef<Autosaver<Program> | null>(null);
  const initialRef = useRef(initial);

  useEffect(() => {
    const saver = createAutosaver<Program>({
      save: (doc) => saveRef.current(doc),
      onState: (s) => {
        setSaveState(s);
        setRetrying(saverRef.current?.isRetrying() ?? false);
      },
    });
    saverRef.current = saver;
    return () => {
      // No lost tail: flush a pending save when the editor unmounts (in-app navigation).
      void saver.flush().finally(() => saver.dispose());
    };
  }, []);

  // Every change goes to the autosaver; the untouched server document (also on the strict-mode re-run) never does.
  useEffect(() => {
    if (program === initialRef.current) return;
    saverRef.current?.change(program);
  }, [program]);

  // Flush when the tab is hidden or the page is going away; warn while changes are unsaved.
  useEffect(() => {
    const flush = () => void saverRef.current?.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saverRef.current?.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onOnline = () => void saverRef.current?.retry();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const update = useCallback((fn: (p: Program) => Program) => setProgram(fn), []);

  const actions = useMemo(
    () => ({
      setTitle: (title: string) => update((p) => ({ ...p, title })),
      setProgramDescription: (description: string) => update((p) => ({ ...p, description: description || undefined })),
      addSession: () => update((p) => opAddSession(p, setTitleRef.current(p.sessions.length + 1))),
      removeSession: (id: string) => update((p) => opRemoveSession(p, id)),
      renameSession: (id: string, title: string) =>
        update((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? { ...s, title } : s)) })),
      setSessionDescription: (id: string, description: string) =>
        update((p) => ({
          ...p,
          sessions: p.sessions.map((s) => (s.id === id ? { ...s, description: description || undefined } : s)),
        })),
      reorderSessions: (activeId: string, overId: string) => update((p) => opReorderSessions(p, activeId, overId)),
      moveSessionBy: (id: string, delta: -1 | 1) => update((p) => opMoveSessionBy(p, id, delta)),
      setSlotsCount: (id: string, count: number) => update((p) => opSetSlotsCount(p, id, count)),
      setSlot: (id: string, idx: number, asana: Asana | null) => update((p) => opSetSlot(p, id, idx, asana)),
      moveSlot: (fromId: string, fromIdx: number, toId: string, toIdx: number) =>
        update((p) => opMoveSlot(p, fromId, fromIdx, toId, toIdx)),
      moveSlotBy: (id: string, idx: number, delta: -1 | 1) => update((p) => opMoveSlotBy(p, id, idx, delta)),
      setSegments: (id: string, idx: number, segments: Segment[]) => update((p) => opSetSegments(p, id, idx, segments)),
      setSlotColor: (id: string, idx: number, color: SlotColor | null) => update((p) => opSetSlotColor(p, id, idx, color)),
      setSlotSide: (id: string, idx: number, side: SlotSide | null) => update((p) => opSetSlotSide(p, id, idx, side)),
      clearProgram: () => update((p) => opClearProgram(p, setTitleRef.current(1))),
      setScheduleEnabled: (enabled: boolean) => update((p) => opSetScheduleEnabled(p, enabled)),
      setScheduleDays: (days: number) => update((p) => opSetScheduleDays(p, days)),
      setScheduleCell: (key: string, day: number, color: SlotColor | null) =>
        update((p) => opSetScheduleCell(p, key, day, color)),
      addScheduleRow: () => update((p) => opAddScheduleRow(p)),
      removeScheduleRow: (rowId: string) => update((p) => opRemoveScheduleRow(p, rowId)),
      renameScheduleRow: (rowId: string, label: string) => update((p) => opRenameScheduleRow(p, rowId, label)),
    }),
    [update],
  );

  /** Click-to-add from the catalog. Returns false when every slot (and the last set) is full. */
  const addToFirstEmpty = useCallback(
    (asana: Asana): boolean => {
      // Decide against the rendered state (discrete events flush before the next click), apply functionally.
      if (!opAddToFirstEmpty(program, asana).added) return false;
      setProgram((p) => opAddToFirstEmpty(p, asana).program);
      return true;
    },
    [program],
  );

  const retry = useCallback(() => void saverRef.current?.retry(), []);
  /** Drop unsaved edits (the "Reload latest" path) so the unload warning does not fire. */
  const discardUnsaved = useCallback(() => saverRef.current?.discard(), []);

  return { program, saveState, retrying, addToFirstEmpty, retry, discardUnsaved, ...actions };
}
