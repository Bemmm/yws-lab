/**
 * Autosave engine (spec §6), framework-free so it can be unit-tested with fake timers.
 *
 * - 1,500 ms debounce after the last change; one save in flight at a time (versioned saves
 *   must be sequential), the newest snapshot always wins.
 * - Network failure: keep the latest snapshot and retry with backoff 2 s, 5 s, 15 s, then every 30 s.
 * - `conflict` / `gone` stop autosave for good (the user reloads); `unauthorized` keeps the edits and
 *   waits for a manual retry.
 */

export const AUTOSAVE_DEBOUNCE_MS = 1500;
export const RETRY_BACKOFF_MS = [2000, 5000, 15000, 30000] as const;

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict" | "gone" | "unauthorized";

export type SaveResult =
  | { status: "ok" }
  | { status: "conflict" }
  | { status: "gone" }
  | { status: "unauthorized" }
  /** The server rejected the document: retrying the same content cannot help. */
  | { status: "invalid" };

export interface Autosaver<T> {
  /** Register a new snapshot (call on every edit); schedules a debounced save. */
  change(doc: T): void;
  /** Save now (page hide, navigation). Resolves when nothing is pending or in flight. */
  flush(): Promise<void>;
  /** Manual retry after an error / unauthorized. */
  retry(): Promise<void>;
  /** Forget unsaved edits (before "Reload latest"). */
  discard(): void;
  isDirty(): boolean;
  /** True while a retry is scheduled after a failure. */
  isRetrying(): boolean;
  dispose(): void;
}

export function createAutosaver<T>(opts: {
  save: (doc: T) => Promise<SaveResult>;
  onState: (state: SaveState) => void;
  debounceMs?: number;
  backoffMs?: readonly number[];
}): Autosaver<T> {
  const debounceMs = opts.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const backoff = opts.backoffMs ?? RETRY_BACKOFF_MS;

  let latest: T | undefined;
  let dirty = false;
  let stopped = false; // conflict / gone
  let inFlight: Promise<void> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let autoRetry = true;
  let disposed = false;

  function clearTimers() {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (retryTimer) clearTimeout(retryTimer);
    debounceTimer = null;
    retryTimer = null;
  }

  function run(): Promise<void> {
    if (disposed || stopped || !dirty) return Promise.resolve();
    if (inFlight) return inFlight;
    clearTimers();
    const snapshot = latest as T;
    opts.onState("saving");
    inFlight = (async () => {
      let res: SaveResult | { status: "error" };
      try {
        res = await opts.save(snapshot);
      } catch {
        res = { status: "error" };
      }
      inFlight = null;
      if (disposed) return;
      switch (res.status) {
        case "ok":
          failures = 0;
          autoRetry = true;
          if (latest === snapshot) {
            dirty = false;
            opts.onState("saved");
          } else {
            // Edited while saving: the debounce timer set by change() will save the newer snapshot.
            opts.onState("saving");
            if (!debounceTimer) debounceTimer = setTimeout(() => void run(), 0);
          }
          return;
        case "conflict":
        case "gone":
          stopped = true;
          clearTimers();
          opts.onState(res.status);
          return;
        case "unauthorized":
          autoRetry = false;
          opts.onState("unauthorized");
          return;
        case "invalid":
          autoRetry = false;
          opts.onState("error");
          return;
        default: {
          opts.onState("error");
          if (!autoRetry || retryTimer) return;
          const delay = backoff[Math.min(failures, backoff.length - 1)]!;
          failures += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void run();
          }, delay);
        }
      }
    })();
    return inFlight;
  }

  return {
    change(doc) {
      if (disposed || stopped) return;
      latest = doc;
      dirty = true;
      autoRetry = true;
      opts.onState("saving");
      if (debounceTimer) clearTimeout(debounceTimer);
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void run();
      }, debounceMs);
    },
    async flush() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      // Loop: an edit made during the in-flight save must also be flushed.
      for (let i = 0; i < 5 && dirty && !stopped && !disposed; i++) {
        const before = latest;
        await run();
        if (latest === before && !dirty) break;
        if (!autoRetry || failures > 0) break;
      }
    },
    async retry() {
      if (stopped) return;
      failures = 0;
      autoRetry = true;
      await run();
    },
    discard() {
      dirty = false;
      clearTimers();
    },
    isDirty: () => dirty,
    isRetrying: () => retryTimer !== null,
    dispose() {
      disposed = true;
      clearTimers();
    },
  };
}
