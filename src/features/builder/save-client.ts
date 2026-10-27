import type { HideSaveResult, SaveResult } from "./autosave";
import type { Program } from "./model";
import type { SavePlanResult } from "@/server/plans/actions";

/**
 * Client side of versioned saves. Tracks the last acknowledged version and the ids of saves whose response was never
 * seen (network error, lost response, 5xx): those may have been applied by the server, so the next save lists them
 * and the server can recognise the client's own write instead of reporting a false conflict (YWSLAB-69).
 */

/** Browsers cap in-flight keepalive bodies at 64 KiB; stay below it. Larger documents rely on the unload warning. */
export const KEEPALIVE_MAX_BYTES = 60_000;
const MAX_UNACKED = 10;

export type SaveMetaPayload = { saveId: string; unackedSaveIds: string[] };

export function newSaveId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function createSaveClient(opts: {
  planId: string;
  initialVersion: number;
  /** Server action transport. */
  action: (id: string, doc: Program, version: number, meta: SaveMetaPayload) => Promise<SavePlanResult>;
  /** fetch transport (injectable for tests). */
  fetchImpl?: typeof fetch;
  newId?: () => string;
}) {
  let version = opts.initialVersion;
  let unacked: string[] = [];
  const newId = opts.newId ?? newSaveId;

  function settle(saveId: string, res: SavePlanResult): SaveResult {
    switch (res.status) {
      case "ok":
        version = res.version;
        unacked = []; // the server answered: every earlier lost save is resolved
        return { status: "ok" };
      case "error":
        // The server failed after maybe applying: stay unacknowledged and let the autosaver retry.
        throw new Error("save failed");
      default:
        // Definite answer, nothing applied under this id.
        unacked = unacked.filter((x) => x !== saveId);
        if (res.status === "conflict") return { status: "conflict" };
        if (res.status === "not_found") return { status: "gone" };
        if (res.status === "unauthorized") return { status: "unauthorized" };
        return { status: "invalid" };
    }
  }

  function begin(): { saveId: string; meta: SaveMetaPayload } {
    const saveId = newId();
    const meta = { saveId, unackedSaveIds: unacked.slice(-MAX_UNACKED) };
    unacked = [...unacked, saveId].slice(-MAX_UNACKED);
    return { saveId, meta };
  }

  return {
    async save(doc: Program): Promise<SaveResult> {
      const { saveId, meta } = begin();
      return settle(saveId, await opts.action(opts.planId, doc, version, meta));
    },
    /** keepalive POST for the final flush; `skipped` when the body would exceed the keepalive limit. */
    async saveOnHide(doc: Program): Promise<HideSaveResult> {
      const { saveId, meta } = begin();
      const body = JSON.stringify({ document: doc, expectedVersion: version, meta });
      if (new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) {
        unacked = unacked.filter((x) => x !== saveId);
        return { status: "skipped" };
      }
      const f = opts.fetchImpl ?? fetch;
      const res = await f(`/api/plans/${encodeURIComponent(opts.planId)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "same-origin",
      });
      let parsed: SavePlanResult;
      try {
        parsed = (await res.json()) as SavePlanResult;
      } catch {
        parsed = { status: "error" };
      }
      return settle(saveId, parsed);
    },
  };
}
