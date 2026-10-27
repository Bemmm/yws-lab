import { describe, expect, it } from "vitest";
import type { SavePlanResult } from "@/server/plans/actions";
import { createSaveClient, KEEPALIVE_MAX_BYTES, type SaveMetaPayload } from "./save-client";
import type { Program } from "./model";

const doc = (n = 0) => ({ id: "p", title: "x".repeat(n) }) as unknown as Program;

function setup(results: Array<SavePlanResult | Error>) {
  const calls: Array<{ version: number; meta: SaveMetaPayload }> = [];
  let i = 0;
  const client = createSaveClient({
    planId: "p",
    initialVersion: 1,
    newId: () => `id-${++i}-xxxxxxxx`,
    action: async (_id, _doc, version, meta) => {
      calls.push({ version, meta });
      const r = results.shift() ?? { status: "ok", version: version + 1, updatedAt: "" };
      if (r instanceof Error) throw r;
      return r;
    },
  });
  return { client, calls };
}

describe("save client bookkeeping", () => {
  it("lists a save whose response was lost as unacknowledged in the next save", async () => {
    const { client, calls } = setup([new Error("network"), { status: "ok", version: 3, updatedAt: "" }]);
    await expect(client.save(doc())).rejects.toThrow();
    await expect(client.save(doc())).resolves.toEqual({ status: "ok" });
    expect(calls[0]!.meta.unackedSaveIds).toEqual([]);
    expect(calls[1]).toMatchObject({ version: 1, meta: { saveId: "id-2-xxxxxxxx", unackedSaveIds: ["id-1-xxxxxxxx"] } });
  });

  it("clears the unacknowledged list after an ok and uses the new version", async () => {
    const { client, calls } = setup([new Error("x"), { status: "ok", version: 3, updatedAt: "" }]);
    await expect(client.save(doc())).rejects.toThrow();
    await client.save(doc());
    await client.save(doc());
    expect(calls[2]).toMatchObject({ version: 3, meta: { unackedSaveIds: [] } });
  });

  it("a definite conflict answer drops that id", async () => {
    const { client, calls } = setup([{ status: "conflict", latestVersion: 5 }]);
    await expect(client.save(doc())).resolves.toEqual({ status: "conflict" });
    await client.save(doc());
    expect(calls[1]!.meta.unackedSaveIds).toEqual([]);
  });

  it("keepalive: sends keepalive POST and maps the response", async () => {
    let init: RequestInit | undefined;
    const client = createSaveClient({
      planId: "p",
      initialVersion: 4,
      action: async () => ({ status: "error" }),
      fetchImpl: (async (_u: string, i: RequestInit) => {
        init = i;
        return new Response(JSON.stringify({ status: "ok", version: 5, updatedAt: "" }));
      }) as typeof fetch,
    });
    await expect(client.saveOnHide(doc())).resolves.toEqual({ status: "ok" });
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init!.body as string)).toMatchObject({ expectedVersion: 4 });
  });

  it("keepalive: skips bodies over the keepalive limit without sending", async () => {
    let sent = false;
    const client = createSaveClient({
      planId: "p",
      initialVersion: 1,
      action: async () => ({ status: "error" }),
      fetchImpl: (async () => ((sent = true), new Response("{}"))) as typeof fetch,
    });
    await expect(client.saveOnHide(doc(KEEPALIVE_MAX_BYTES))).resolves.toEqual({ status: "skipped" });
    expect(sent).toBe(false);
  });
});
