import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type SaveResult, type SaveState } from "./autosave";

function setup(results: Array<SaveResult | Error>) {
  const calls: string[] = [];
  const states: SaveState[] = [];
  const queue = [...results];
  const saver = createAutosaver<string>({
    save: async (doc) => {
      calls.push(doc);
      const next = queue.shift() ?? { status: "ok" };
      if (next instanceof Error) throw next;
      return next;
    },
    onState: (s) => states.push(s),
  });
  return { saver, calls, states };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autosave", () => {
  it("debounces 1.5 s and saves only the latest snapshot", async () => {
    const { saver, calls, states } = setup([]);
    saver.change("a");
    await vi.advanceTimersByTimeAsync(1000);
    saver.change("b");
    await vi.advanceTimersByTimeAsync(1499);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(calls).toEqual(["b"]);
    expect(states.at(-1)).toBe("saved");
    expect(saver.isDirty()).toBe(false);
  });

  it("keeps saves sequential and saves the newer snapshot after an in-flight one", async () => {
    let release!: () => void;
    const calls: string[] = [];
    const saver = createAutosaver<string>({
      save: (doc) => {
        calls.push(doc);
        return calls.length === 1 ? new Promise((r) => (release = () => r({ status: "ok" }))) : Promise.resolve({ status: "ok" });
      },
      onState: () => {},
    });
    saver.change("a");
    await vi.advanceTimersByTimeAsync(1500);
    saver.change("b");
    await vi.advanceTimersByTimeAsync(1500); // timer fires while "a" is still in flight
    expect(calls).toEqual(["a"]);
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toEqual(["a", "b"]);
    expect(saver.isDirty()).toBe(false);
  });

  it("retries a network error with backoff 2 s, 5 s, 15 s, then 30 s, always with the latest snapshot", async () => {
    const boom = new Error("net");
    const { saver, calls, states } = setup([boom, boom, boom, boom, boom, { status: "ok" }]);
    saver.change("a");
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toEqual(["a"]);
    expect(states.at(-1)).toBe("error");
    expect(saver.isRetrying()).toBe(true);

    saver.change("b"); // newer edit while a retry is pending: it replaces the pending retry
    await vi.advanceTimersByTimeAsync(1499);
    expect(calls).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["a", "b"]); // failures = 2 -> next delay 5 s
    await vi.advanceTimersByTimeAsync(4999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["a", "b", "b"]); // next delay 15 s
    await vi.advanceTimersByTimeAsync(14999);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(4); // then every 30 s
    await vi.advanceTimersByTimeAsync(29999);
    expect(calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(30000);
    expect(calls).toHaveLength(6);
    expect(calls.slice(1).every((c) => c === "b")).toBe(true);
    expect(states.at(-1)).toBe("saved");
    expect(saver.isDirty()).toBe(false);
  });

  it("first failure retries after 2 s", async () => {
    const { saver, calls } = setup([new Error("net"), { status: "ok" }]);
    saver.change("a");
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["a", "a"]);
  });

  it("manual retry works and resets the backoff", async () => {
    const { saver, calls, states } = setup([new Error("x"), { status: "ok" }]);
    saver.change("a");
    await vi.advanceTimersByTimeAsync(1500);
    expect(states.at(-1)).toBe("error");
    await saver.retry();
    expect(calls).toEqual(["a", "a"]);
    expect(states.at(-1)).toBe("saved");
  });

  it("stops for good on conflict and gone", async () => {
    for (const status of ["conflict", "gone"] as const) {
      const { saver, calls, states } = setup([{ status }]);
      saver.change("a");
      await vi.advanceTimersByTimeAsync(1500);
      expect(states.at(-1)).toBe(status);
      saver.change("b");
      await saver.flush();
      await vi.advanceTimersByTimeAsync(60000);
      expect(calls).toEqual(["a"]);
    }
  });

  it("unauthorized keeps the edits and waits for a manual retry", async () => {
    const { saver, calls, states } = setup([{ status: "unauthorized" }, { status: "ok" }]);
    saver.change("a");
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toEqual(["a"]);
    expect(states.at(-1)).toBe("unauthorized");
    expect(saver.isDirty()).toBe(true);
    await saver.retry();
    expect(states.at(-1)).toBe("saved");
  });

  it("flush saves the pending tail immediately (page hide / navigation)", async () => {
    const { saver, calls } = setup([]);
    saver.change("a");
    await saver.flush();
    expect(calls).toEqual(["a"]);
    expect(saver.isDirty()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual(["a"]);
  });

  it("an invalid document is not retried automatically", async () => {
    const { saver, calls, states } = setup([{ status: "invalid" }]);
    saver.change("a");
    await vi.advanceTimersByTimeAsync(120000);
    expect(calls).toEqual(["a"]);
    expect(states.at(-1)).toBe("error");
    expect(saver.isRetrying()).toBe(false);
  });

  it("discard forgets unsaved edits", async () => {
    const { saver, calls } = setup([]);
    saver.change("a");
    saver.discard();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([]);
    expect(saver.isDirty()).toBe(false);
  });
});
