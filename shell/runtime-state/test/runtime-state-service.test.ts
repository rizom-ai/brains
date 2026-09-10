import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { z } from "@brains/utils/zod";
import { RuntimeStateService } from "../src";
import { migrateRuntimeState } from "../src/migrate";

const subscriptionSchema = z.object({ subscribedAt: z.string().datetime() });
const stringSchema = z.string();

async function expectPromiseToReject(promise: Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await promise;
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

describe("RuntimeStateService", () => {
  let tempDir: string;
  let dbUrl: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brains-runtime-state-"));
    dbUrl = `file:${join(tempDir, "runtime-state.db")}`;
    await migrateRuntimeState({ url: dbUrl });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("initializes WAL mode once", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const first = service.initialize();
    const second = service.initialize();

    expect(second).toBe(first);
    await first;
    service.close();
  });

  it("persists records across service recreation", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const subscriptions = service.scoped({
      namespace: "chat.discord.subscriptions",
      schema: subscriptionSchema,
    });

    await subscriptions.set("thread-123", {
      subscribedAt: "2026-06-16T00:00:00.000Z",
    });
    service.close();

    const restarted = RuntimeStateService.createFresh({ url: dbUrl });
    const restartedSubscriptions = restarted.scoped({
      namespace: "chat.discord.subscriptions",
      schema: subscriptionSchema,
    });

    expect(await restartedSubscriptions.get("thread-123")).toEqual({
      subscribedAt: "2026-06-16T00:00:00.000Z",
    });
    expect(await restartedSubscriptions.has("thread-123")).toBe(true);
    restarted.close();
  });

  it("pages in key order before schema parsing and treats prefixes literally", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const raw = service.scoped({ namespace: "pages", schema: z.unknown() });
    const strings = service.scoped({
      namespace: "pages",
      schema: stringSchema,
    });
    try {
      await raw.set("literal%/a", "a");
      await raw.set("literal%/b", "b");
      await raw.set("literalX/a", "not a prefix match");
      await raw.set("z-invalid", 123);
      await raw.set("nul\u0000/a", "nul");
      await raw.set("nul\u0000/b", "next nul key");
      expect(
        (await strings.list({ keyPrefix: "nul\u0000/", limit: 1 })).map(
          (record) => record.key,
        ),
      ).toEqual(["nul\u0000/a"]);
      expect(
        (
          await strings.list({
            keyPrefix: "nul\u0000/",
            afterKey: "nul\u0000/a",
            limit: 1,
          })
        ).map((record) => record.key),
      ).toEqual(["nul\u0000/b"]);
      const first = await strings.list({ keyPrefix: "literal%/", limit: 1 });
      expect(first.map((record) => record.key)).toEqual(["literal%/a"]);
      const second = await strings.list({
        keyPrefix: "literal%/",
        limit: 1,
        afterKey: "literal%/a",
      });
      expect(second.map((record) => record.key)).toEqual(["literal%/b"]);
      expect(
        await strings.list({
          keyPrefix: "literal%/",
          limit: 1,
          afterKey: "literal%/b",
        }),
      ).toEqual([]);
      expect(await strings.list({ limit: 1 })).toHaveLength(1);
      expect(
        strings.list({ limit: 0, keyPrefix: "literal%/" }),
      ).rejects.toThrow();
      expect(
        strings.list({ limit: 1001, keyPrefix: "literal%/" }),
      ).rejects.toThrow();
    } finally {
      service.close();
    }
  });

  it("isolates records by namespace", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const chat = service.scoped({
      namespace: "chat.discord.subscriptions",
      schema: stringSchema,
    });
    const playbooks = service.scoped({
      namespace: "playbooks.runs",
      schema: stringSchema,
    });

    await chat.set("same-key", "chat-value");
    await playbooks.set("same-key", "playbook-value");

    expect(await chat.get("same-key")).toBe("chat-value");
    expect(await playbooks.get("same-key")).toBe("playbook-value");
    service.close();
  });

  it("supports atomic insert-if-absent semantics", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const store = service.scoped({ namespace: "dedupe", schema: stringSchema });

    expect(await store.setIfNotExists("message-1", "first")).toBe(true);
    expect(await store.setIfNotExists("message-1", "second")).toBe(false);
    expect(await store.get("message-1")).toBe("first");
    service.close();
  });

  it("atomically compares and replaces across independent database connections", async () => {
    const first = RuntimeStateService.createFresh({ url: dbUrl });
    const second = RuntimeStateService.createFresh({ url: dbUrl });
    try {
      await Promise.all([first.initialize(), second.initialize()]);
      const schema = z.object({
        revision: z.number().int(),
        count: z.number().int(),
      });
      const left = first.scoped({ namespace: "reservations", schema });
      const right = second.scoped({ namespace: "reservations", schema });
      const initial = { revision: 0, count: 0 };
      expect(
        await left.compareAndSet("missing", initial, { revision: 1, count: 1 }),
      ).toBe(false);
      await left.set("ledger", initial);
      const results = await Promise.all([
        left.compareAndSet("ledger", initial, { revision: 1, count: 1 }),
        right.compareAndSet("ledger", initial, { revision: 1, count: 2 }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const winner = await right.get("ledger");
      expect(winner?.revision).toBe(1);
      expect(
        await left.compareAndSet("ledger", initial, {
          revision: 2,
          count: 100,
        }),
      ).toBe(false);
      expect(await left.get("ledger")).toEqual(winner);
      const other = first.scoped({ namespace: "other-reservations", schema });
      expect(
        await other.compareAndSet("ledger", initial, { revision: 1, count: 1 }),
      ).toBe(false);
    } finally {
      first.close();
      second.close();
    }
  });

  it("validates both compare-and-set values before writing", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const store = service.scoped({
      namespace: "cas-validation",
      schema: z.number().int().nonnegative(),
    });
    try {
      await store.set("counter", 1);
      expect(store.compareAndSet("counter", 1, -1)).rejects.toThrow();
      expect(store.compareAndSet("counter", -1, 2)).rejects.toThrow();
      expect(await store.get("counter")).toBe(1);
    } finally {
      service.close();
    }
  });

  it("lists and clears by literal key prefix", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const store = service.scoped({ namespace: "prefix", schema: stringSchema });

    await store.set("thread_%_1", "one");
    await store.set("thread_%_2", "two");
    await store.set("thread-x-3", "three");

    const listed = await store.list({ keyPrefix: "thread_%_" });
    expect(listed.map((record) => record.key).sort()).toEqual([
      "thread_%_1",
      "thread_%_2",
    ]);

    expect(await store.clear({ keyPrefix: "thread_%_" })).toBe(2);
    expect(await store.has("thread_%_1")).toBe(false);
    expect(await store.has("thread_%_2")).toBe(false);
    expect(await store.has("thread-x-3")).toBe(true);
    service.close();
  });

  it("validates values with the provided Zod schema on write and read", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const store = service.scoped({
      namespace: "validated",
      schema: subscriptionSchema,
    });

    await expectPromiseToReject(
      store.set("invalid", { subscribedAt: "not-a-date" }),
    );

    await store.set("valid", { subscribedAt: "2026-06-16T00:00:00.000Z" });

    const mismatchedStore = service.scoped({
      namespace: "validated",
      schema: z.object({ other: z.string() }),
    });
    await expectPromiseToReject(mismatchedStore.get("valid"));
    service.close();
  });

  it("deletes individual records", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const store = service.scoped({ namespace: "delete", schema: stringSchema });

    await store.set("key", "value");
    expect(await store.delete("key")).toBe(true);
    expect(await store.delete("key")).toBe(false);
    expect(await store.get("key")).toBeNull();
    service.close();
  });
});
