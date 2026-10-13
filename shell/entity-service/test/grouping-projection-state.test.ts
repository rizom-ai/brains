import { describe, expect, test } from "bun:test";
import {
  GroupingProjectionState,
  type GroupingProjectionTarget,
} from "../src/grouping-projection-state";
import { GroupingReprojection } from "../src/grouping-reprojection-coordinator";

const note = { key: "areas", label: "Areas", field: "areas", types: ["note"] };
function coordinator(
  state: GroupingProjectionState,
  project: (
    targets: readonly GroupingProjectionTarget[] | undefined,
  ) => Promise<void>,
  refresh: () => Promise<void> = async () => {},
): GroupingReprojection {
  return new GroupingReprojection({
    pending: (): GroupingProjectionTarget[] => state.pending(),
    complete: (targets): void => state.complete(targets),
    refresh,
    project,
  });
}

describe("ephemeral grouping projection state", () => {
  test("tracks only added type/field pairs, not labels or removals", () => {
    const state = new GroupingProjectionState();
    state.replace([note]);
    const first = state.pending();
    expect(first).toEqual([
      expect.objectContaining({ entityType: "note", field: "areas" }),
    ]);
    state.complete(first);
    state.replace([{ ...note, label: "Research", types: ["note", "post"] }]);
    expect(state.pending()).toEqual([
      expect.objectContaining({ entityType: "post", field: "areas" }),
    ]);
    state.replace([note]);
    expect(state.pending()).toEqual([]);
  });
  test("a pass cannot acknowledge a removed and re-added field from an older generation", () => {
    const state = new GroupingProjectionState();
    state.replace([note]);
    const old = state.pending();
    state.replace([]);
    state.replace([note]);
    state.complete(old);
    expect(state.pending()).toHaveLength(1);
    state.complete(state.pending());
    expect(state.pending()).toEqual([]);
  });
  test("deduplicates shared fields and returns defensive snapshots", () => {
    const state = new GroupingProjectionState();
    state.replace([note, { ...note, key: "another-name" }]);
    const pending = state.pending();
    expect(pending).toHaveLength(1);
    if (pending[0]) pending[0].field = "changed";
    expect(state.pending()[0]?.field).toBe("areas");
  });
  test("an observer can conservatively invalidate unchanged pairs without persistent state", () => {
    const state = new GroupingProjectionState();
    state.replace([note]);
    const old = state.pending();
    state.complete(old);
    state.replace([note], true);
    state.complete(old);
    expect(state.pending()).toHaveLength(1);
    expect(state.pending()[0]?.generation).not.toBe(old[0]?.generation);
  });
});

describe("in-memory reprojection coordinator", () => {
  test("coalesces concurrent requests, blocks readiness, and drains additions made during a pass", async () => {
    const state = new GroupingProjectionState();
    const passes: unknown[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = coordinator(state, async (targets) => {
      passes.push(targets);
      if (passes.length === 1) await gate;
    });
    state.replace([note]);
    const first = runner.run();
    const second = runner.run();
    expect(second).toBe(first);
    expect(runner.isReady()).toBe(false);
    await Promise.resolve();
    state.replace([{ ...note, types: ["note", "post"] }]);
    release?.();
    await first;
    expect(passes).toHaveLength(2);
    expect(passes[1]).toEqual([
      expect.objectContaining({ entityType: "post", field: "areas" }),
    ]);
    expect(runner.isReady()).toBe(true);
    await runner.run();
    expect(passes).toHaveLength(2);
  });
  test("readiness polls during the first pass do not request extra full scans", async () => {
    const state = new GroupingProjectionState();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let scans = 0;
    const runner = coordinator(state, async () => {
      scans++;
      await gate;
    });
    const first = runner.run();
    await Promise.resolve();
    expect(runner.run()).toBe(first);
    release?.();
    await first;
    expect(scans).toBe(1);
  });
  test("failed scans stay unready and retry without losing pending targets", async () => {
    const state = new GroupingProjectionState();
    state.replace([note]);
    let fail = true;
    const runner = coordinator(state, async () => {
      if (fail) throw new Error("Interrupted");
    });
    expect(await runner.run().catch((error: unknown) => error)).toMatchObject({
      message: "Interrupted",
    });
    expect(runner.isReady()).toBe(false);
    expect(state.pending()).toHaveLength(1);
    fail = false;
    await runner.run();
    expect(runner.isReady()).toBe(true);
  });
  test("a failed final refresh cannot publish readiness even when the scanned targets completed", async () => {
    const state = new GroupingProjectionState();
    let refreshes = 0;
    const runner = coordinator(
      state,
      async () => {},
      async () => {
        if (++refreshes === 2) throw new Error("Read failed");
      },
    );
    expect(await runner.run().catch((error: unknown) => error)).toMatchObject({
      message: "Read failed",
    });
    expect(runner.isReady()).toBe(false);
    await runner.run();
    expect(runner.isReady()).toBe(true);
  });
  test("every explicit startup pass rescans, even after successful completion", async () => {
    const state = new GroupingProjectionState();
    const passes: unknown[] = [];
    const runner = coordinator(state, async (targets) => {
      passes.push(targets);
    });
    await runner.run(true);
    await runner.run(true);
    expect(passes).toEqual([undefined, undefined]);
  });
  test("a full pass requested during a delta pass is not lost", async () => {
    const state = new GroupingProjectionState();
    const passes: unknown[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = coordinator(state, async (targets) => {
      passes.push(targets);
      if (passes.length === 2) await gate;
    });
    await runner.run(true);
    state.replace([note]);
    const delta = runner.run();
    await Promise.resolve();
    expect(runner.run(true)).toBe(delta);
    release?.();
    await delta;
    expect(passes).toHaveLength(3);
    expect(passes[2]).toBeUndefined();
    expect(runner.isReady()).toBe(true);
  });
  test("bounds repeated definition changes rather than holding startup forever", async () => {
    const state = new GroupingProjectionState();
    state.replace([note]);
    let passes = 0;
    const runner = coordinator(state, async () => {
      passes++;
      state.replace([]);
      state.replace([note]);
    });
    expect(await runner.run().catch((error: unknown) => error)).toMatchObject({
      message: expect.stringContaining("changed repeatedly"),
    });
    expect(passes).toBe(4);
    expect(runner.isReady()).toBe(false);
  });
});
