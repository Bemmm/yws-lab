import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../scripts/migrate.mjs";

// `server-only` throws outside the React server graph; the service layer is server code under test here.
vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL_TEST ?? "postgres://yws:yws@localhost:5432/yws_test";
process.env.DATABASE_URL = url;
const sql = postgres(url, { max: 2, onnotice: () => {} });

type Service = typeof import("@/server/plans/service");
let svc: Service;
let ASANAS: typeof import("@/features/builder/asana-manifest").ASANAS;
let A: string; // account A
let B: string; // account B
const tag = `it-plans-${Date.now()}`;

async function makeAccount(n: number): Promise<string> {
  const [row] = await sql`insert into account (telegram_id, name) values (${Date.now() * 10 + n}, ${`${tag}-${n}`}) returning id`;
  return row!.id as string;
}

/** A valid document with one filled slot, shaped like the editor sends it. */
function docWith(title: string, over: Record<string, unknown> = {}) {
  return {
    id: "ignored-by-server",
    title,
    sessions: [
      {
        id: "s1",
        title: "Set 1",
        slots: [{ asana: { id: ASANAS[0]!.id, src: ASANAS[0]!.src, label: ASANAS[0]!.label } }, null],
        slotIds: ["u1", "u2"],
      },
    ],
    ...over,
  };
}

beforeAll(async () => {
  await runMigrations(url);
  svc = await import("@/server/plans/service");
  ({ ASANAS } = await import("@/features/builder/asana-manifest"));
  A = await makeAccount(1);
  B = await makeAccount(2);
});

afterAll(async () => {
  await sql`delete from plan where owner_id in (${A}, ${B})`;
  await sql`delete from account where id in (${A}, ${B})`;
  await sql.end();
});

describe("create / read", () => {
  it("creates an empty plan (one set of 6 empty slots) and reads it back as the owner", async () => {
    const { id } = await svc.createPlan(A, { title: "Нова програма", setTitle: "Сет 1" });
    const got = await svc.getPlan(A, id);
    expect(got).not.toBeNull();
    expect(got!.version).toBe(1);
    expect(got!.shareToken).toBeNull();
    expect(got!.program.id).toBe(id);
    expect(got!.program.sessions).toHaveLength(1);
    expect(got!.program.sessions[0]!.slots).toEqual(Array(6).fill(null));
    expect(got!.program.sessions[0]!.slotIds).toHaveLength(6);
  });

  it("answers a malformed id like a missing one", async () => {
    expect(await svc.getPlan(A, "not-a-uuid")).toBeNull();
    expect(await svc.getPlan(A, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("ownership: user B cannot touch user A's plan", () => {
  it("cannot read, save, delete, duplicate or share it, and nothing changes", async () => {
    const { id } = await svc.createPlan(A, { title: "A private", setTitle: "Set 1" });

    expect(await svc.getPlan(B, id)).toBeNull();
    expect(await svc.savePlan(B, id, docWith("hijacked"), 1)).toEqual({ status: "not_found" });
    expect(await svc.duplicatePlan(B, id, { copySuffix: "(copy)", untitled: "Untitled" })).toBeNull();
    expect(await svc.enableShare(B, id)).toBeNull();
    expect(await svc.disableShare(B, id)).toBe(false);
    expect(await svc.deletePlan(B, id)).toBe(false);

    const listB = await svc.listPlans(B, {});
    expect(listB.items.find((p) => p.id === id)).toBeUndefined();

    const mine = await svc.getPlan(A, id);
    expect(mine!.program.title).toBe("A private");
    expect(mine!.version).toBe(1);
    expect(mine!.shareToken).toBeNull();
  });

  it("the document's own id field is never used to pick a row", async () => {
    const a = await svc.createPlan(A, { title: "A target", setTitle: "S" });
    const b = await svc.createPlan(B, { title: "B own", setTitle: "S" });
    // B saves their plan with a document claiming A's plan id: only B's row changes.
    const res = await svc.savePlan(B, b.id, { ...docWith("B edited"), id: a.id }, 1);
    expect(res.status).toBe("ok");
    expect((await svc.getPlan(A, a.id))!.program.title).toBe("A target");
    const bOwn = await svc.getPlan(B, b.id);
    expect(bOwn!.program.title).toBe("B edited");
    expect(bOwn!.program.id).toBe(b.id);
  });
});

describe("versioned saves", () => {
  it("bumps the version, mirrors the title and canonicalizes asana data from the catalog", async () => {
    const { id } = await svc.createPlan(A, { title: "v", setTitle: "S" });
    const lying = docWith("Saved title");
    (lying.sessions[0]!.slots[0] as { asana: { src: string; label: string } }).asana = { ...ASANAS[0]!, src: "/evil.svg", label: "Evil" } as never;
    const res = await svc.savePlan(A, id, lying, 1);
    expect(res).toMatchObject({ status: "ok", version: 2 });
    const got = await svc.getPlan(A, id);
    expect(got!.version).toBe(2);
    expect(got!.program.title).toBe("Saved title");
    expect(got!.program.sessions[0]!.slots[0]!.asana).toEqual({ id: ASANAS[0]!.id, src: ASANAS[0]!.src, label: ASANAS[0]!.label });
    const [row] = await sql`select title from plan where id = ${id}`;
    expect(row!.title).toBe("Saved title");
  });

  it("rejects a stale version with a typed conflict and never overwrites the newer save", async () => {
    const { id } = await svc.createPlan(A, { title: "c", setTitle: "S" });
    expect(await svc.savePlan(A, id, docWith("tab 1"), 1)).toMatchObject({ status: "ok", version: 2 });
    // tab 2 still holds version 1
    expect(await svc.savePlan(A, id, docWith("tab 2 (stale)"), 1)).toEqual({ status: "conflict", latestVersion: 2 });
    const got = await svc.getPlan(A, id);
    expect(got!.program.title).toBe("tab 1");
    expect(got!.version).toBe(2);
  });

  it("two concurrent saves from the same version: exactly one wins", async () => {
    const { id } = await svc.createPlan(A, { title: "race", setTitle: "S" });
    const results = await Promise.all([svc.savePlan(A, id, docWith("one"), 1), svc.savePlan(A, id, docWith("two"), 1)]);
    expect(results.map((r) => r.status).sort()).toEqual(["conflict", "ok"]);
    expect((await svc.getPlan(A, id))!.version).toBe(2);
  });

  it("a retry of an already-applied save is ok, not a conflict with itself", async () => {
    const { id } = await svc.createPlan(A, { title: "idem", setTitle: "S" });
    const first = await svc.savePlan(A, id, docWith("same content"), 1);
    expect(first).toMatchObject({ status: "ok", version: 2 });
    const retry = await svc.savePlan(A, id, docWith("same content"), 1); // response was lost, client retries
    expect(retry).toMatchObject({ status: "ok", version: 2 });
    expect((await svc.getPlan(A, id))!.version).toBe(2);
  });

  it("rejects invalid documents (oversize / limits) with `invalid` and stores nothing", async () => {
    const { id } = await svc.createPlan(A, { title: "validation", setTitle: "S" });
    const tooManySlots = docWith("x", {
      sessions: [{ id: "s1", title: "S", slots: Array(37).fill(null), slotIds: Array.from({ length: 37 }, (_, i) => `i${i}`) }],
    });
    const hugeText = docWith("x", { description: "x".repeat(300 * 1024) });
    const badColour = docWith("x");
    (badColour.sessions[0]!.slots[0] as Record<string, unknown>).color = "teal";
    const longTitle = docWith("t".repeat(121));
    for (const bad of [tooManySlots, hugeText, badColour, longTitle, "string", null]) {
      expect(await svc.savePlan(A, id, bad, 1)).toEqual({ status: "invalid" });
    }
    expect(await svc.savePlan(A, id, docWith("ok"), 0)).toEqual({ status: "invalid" });
    const got = await svc.getPlan(A, id);
    expect(got!.version).toBe(1);
    expect(got!.program.title).toBe("validation");
  });

  it("saving a soft-deleted plan reports not_found (the editor shows `gone`)", async () => {
    const { id } = await svc.createPlan(A, { title: "gone", setTitle: "S" });
    expect(await svc.deletePlan(A, id)).toBe(true);
    expect(await svc.savePlan(A, id, docWith("late"), 1)).toEqual({ status: "not_found" });
  });
});

describe("share links", () => {
  it("enable is idempotent and issues a 32-byte base64url token", async () => {
    const { id } = await svc.createPlan(A, { title: "share", setTitle: "S" });
    const first = await svc.enableShare(A, id);
    expect(first!.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await svc.enableShare(A, id))!.shareToken).toBe(first!.shareToken);
    expect((await svc.getPlan(A, id))!.shareToken).toBe(first!.shareToken);
  });

  it("disable revokes at once; re-enable issues a different token; the old one stays dead", async () => {
    const { id } = await svc.createPlan(A, { title: "rotate", setTitle: "S" });
    await svc.savePlan(A, id, docWith("rotate"), 1);
    const t1 = (await svc.enableShare(A, id))!.shareToken;
    expect(await svc.getSharedPlan(t1)).not.toBeNull();

    expect(await svc.disableShare(A, id)).toBe(true);
    expect(await svc.getSharedPlan(t1)).toBeNull();
    expect((await svc.getPlan(A, id))!.shareToken).toBeNull();

    const t2 = (await svc.enableShare(A, id))!.shareToken;
    expect(t2).not.toBe(t1);
    expect(await svc.getSharedPlan(t1)).toBeNull();
    expect(await svc.getSharedPlan(t2)).not.toBeNull();
  });

  it("the public read resolves only active tokens and exposes no owner data", async () => {
    const { id } = await svc.createPlan(A, { title: "public", setTitle: "S" });
    await svc.savePlan(A, id, docWith("Public title"), 1);
    const token = (await svc.enableShare(A, id))!.shareToken;

    const shared = await svc.getSharedPlan(token);
    expect(shared!.title).toBe("Public title");
    expect(shared!.id).not.toBe(id); // internal id is not exposed
    expect(JSON.stringify(shared)).not.toContain(A);

    for (const bad of ["", "short", "x".repeat(43), "x".repeat(44), `${token}!`, token.slice(1), "../etc/passwd", "'; drop table plan;--"]) {
      expect(await svc.getSharedPlan(bad)).toBeNull();
    }
    // always shows the current document
    const [row] = await sql`select version from plan where id = ${id}`;
    await svc.savePlan(A, id, docWith("Updated"), row!.version as number);
    expect((await svc.getSharedPlan(token))!.title).toBe("Updated");
  });

  it("deleting a plan revokes its link", async () => {
    const { id } = await svc.createPlan(A, { title: "del-share", setTitle: "S" });
    const token = (await svc.enableShare(A, id))!.shareToken;
    expect(await svc.deletePlan(A, id)).toBe(true);
    expect(await svc.getSharedPlan(token)).toBeNull();
    const [row] = await sql`select share_token from plan where id = ${id}`;
    expect(row!.share_token).toBeNull();
    expect(await svc.enableShare(A, id)).toBeNull();
  });
});

describe("soft delete and library", () => {
  it("soft-deleted plans are hidden everywhere but the row is kept", async () => {
    const { id } = await svc.createPlan(A, { title: "soft-deleted-plan", setTitle: "S" });
    expect((await svc.listPlans(A, { query: "soft-deleted-plan" })).items).toHaveLength(1);
    expect(await svc.deletePlan(A, id)).toBe(true);
    expect(await svc.deletePlan(A, id)).toBe(false);
    expect(await svc.getPlan(A, id)).toBeNull();
    expect((await svc.listPlans(A, { query: "soft-deleted-plan" })).items).toHaveLength(0);
    expect(await svc.duplicatePlan(A, id, { copySuffix: "(c)", untitled: "u" })).toBeNull();
    const [row] = await sql`select deleted_at from plan where id = ${id}`;
    expect(row!.deleted_at).not.toBeNull();
  });

  it("lists newest first with card stats, searches titles safely and paginates", async () => {
    const C = await makeAccount(3);
    try {
      const mk = async (title: string) => {
        const { id } = await svc.createPlan(C, { title, setTitle: "S" });
        return id;
      };
      const first = await mk("Alpha flow");
      const second = await mk("Beta 100%_flow");
      const third = await mk("Gamma");
      await svc.savePlan(C, first, docWith("Alpha flow"), 1);
      await new Promise((r) => setTimeout(r, 15));
      await svc.savePlan(C, third, docWith("Gamma"), 1); // touched last -> newest

      const all = await svc.listPlans(C, {});
      expect(all.items.map((p) => p.id)).toEqual([third, first, second]);
      expect(all.items[0]).toMatchObject({ setsCount: 1, filledSlotsCount: 1, slotsCount: 2, shareActive: false });
      expect(all.items[0]!.previewSrcs).toEqual([ASANAS[0]!.src]);

      expect((await svc.listPlans(C, { query: "ALPHA" })).items.map((p) => p.id)).toEqual([first]);
      // LIKE wildcards in the query are literals
      expect((await svc.listPlans(C, { query: "100%_" })).items.map((p) => p.id)).toEqual([second]);
      expect((await svc.listPlans(C, { query: "%" })).items.map((p) => p.id)).toEqual([second]);
      expect((await svc.listPlans(C, { query: "nothing" })).items).toHaveLength(0);

      const page = await svc.listPlans(C, { limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      expect((await svc.listPlans(C, { limit: 3 })).hasMore).toBe(false);
    } finally {
      await sql`delete from plan where owner_id = ${C}`;
      await sql`delete from account where id = ${C}`;
    }
  });

  it("duplicate copies the document with new ids, no share token, a localized suffix and goes to the top", async () => {
    const { id } = await svc.createPlan(A, { title: "Original", setTitle: "S" });
    await svc.savePlan(A, id, docWith("Original"), 1);
    await svc.enableShare(A, id);

    const copy = await svc.duplicatePlan(A, id, { copySuffix: "(копія)", untitled: "Без назви" });
    const src = (await svc.getPlan(A, id))!;
    const dup = (await svc.getPlan(A, copy!.id))!;
    expect(dup.program.title).toBe("Original (копія)");
    expect(dup.shareToken).toBeNull();
    expect(dup.version).toBe(1);
    expect(dup.program.sessions[0]!.id).not.toBe(src.program.sessions[0]!.id);
    expect(dup.program.sessions[0]!.slotIds).not.toEqual(src.program.sessions[0]!.slotIds);
    expect(dup.program.sessions[0]!.slots).toEqual(src.program.sessions[0]!.slots);
    expect((await svc.listPlans(A, {})).items[0]!.id).toBe(copy!.id);
    // the source keeps its link
    expect(src.shareToken).not.toBeNull();

    // long titles are truncated to fit the 120-char cap; blank titles use the placeholder
    const longId = (await svc.createPlan(A, { title: "L".repeat(120), setTitle: "S" })).id;
    const long = (await svc.getPlan(A, (await svc.duplicatePlan(A, longId, { copySuffix: "(копія)", untitled: "u" }))!.id))!;
    expect(long.program.title).toHaveLength(120);
    expect(long.program.title.endsWith(" (копія)")).toBe(true);
    const blankId = (await svc.createPlan(A, { title: "   ", setTitle: "S" })).id;
    const blank = (await svc.getPlan(A, (await svc.duplicatePlan(A, blankId, { copySuffix: "(копія)", untitled: "Без назви" }))!.id))!;
    expect(blank.program.title).toBe("Без назви (копія)");
  });
});
