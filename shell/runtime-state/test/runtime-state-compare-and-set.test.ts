import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "@brains/utils/zod";
import { RuntimeStateService } from "../src";
import { migrateRuntimeState } from "../src/migrate";

describe("runtime state snapshot compare-and-set", () => {
  let directory: string;
  let service: RuntimeStateService;
  let peer: RuntimeStateService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "brains-state-cas-"));
    const config = { url: `file:${join(directory, "state.db")}` };
    await migrateRuntimeState(config);
    service = RuntimeStateService.createFresh(config);
    peer = RuntimeStateService.createFresh(config);
    await Promise.all([service.initialize(), peer.initialize()]);
  });

  afterEach(async () => {
    service.close();
    peer.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("compares parsed snapshots without reparsing output and persists replacement input", async () => {
    const config = { namespace: "transformed", schema: z.string().transform(Number) };
    const store = service.scoped(config);
    await store.set("key", "42");
    const expected = await store.get("key");
    expect(expected).toBe(42);
    if (expected === null) throw new Error("Missing test state");
    expect(await store.compareAndSet("key", expected, "43")).toBe(true);
    expect(await peer.scoped(config).get("key")).toBe(43);
    expect(await store.compareAndSet("key", expected, "44")).toBe(false);
    expect(await store.get("key")).toBe(43);
  });

  it("matches defaulted snapshots independently of input property order", async () => {
    const store = service.scoped({ namespace: "defaulted", schema: z.object({ revision: z.number().default(0), label: z.string() }) });
    await store.set("key", { label: "before" });
    const expected = await store.get("key");
    expect(expected).toEqual({ revision: 0, label: "before" });
    if (!expected) throw new Error("Missing test state");
    expect(await store.compareAndSet("key", expected, { label: "after", revision: 1 })).toBe(true);
    expect(await store.get("key")).toEqual({ revision: 1, label: "after" });
  });

  it("preserves JSON null and never creates a missing record", async () => {
    const store = service.scoped({ namespace: "nullable", schema: z.string().nullable() });
    expect(await store.compareAndSet("missing", null, "created")).toBe(false);
    await store.set("key", "before");
    expect(await store.compareAndSet("key", "before", null)).toBe(true);
    expect(await store.has("key")).toBe(true);
    expect(await store.compareAndSet("key", null, "after")).toBe(true);
    expect(await store.get("key")).toBe("after");
  });

  it("admits only one concurrent replacement across independent connections", async () => {
    const config = { namespace: "atomic", schema: z.object({ revision: z.number(), count: z.number() }) };
    const store = service.scoped(config);
    const other = peer.scoped(config);
    const expected = { revision: 0, count: 0 };
    await store.set("key", expected);
    const outcomes = await Promise.all([
      store.compareAndSet("key", expected, { revision: 1, count: 1 }),
      other.compareAndSet("key", expected, { revision: 1, count: 1 }),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await store.get("key")).toEqual({ revision: 1, count: 1 });
  });
});
