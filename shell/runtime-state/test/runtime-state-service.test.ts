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

  it("allows bounded qualified owner namespaces without relaxing the character rules", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    try {
      await service.initialize();
      const store = service.scoped({
        namespace: "n".repeat(512),
        schema: stringSchema,
      });
      await store.set("key", "value");
      expect(await store.get("key")).toBe("value");
      for (const namespace of [
        "n".repeat(513),
        "",
        "invalid/path",
        "invalid space",
      ]) {
        expect(() =>
          service.scoped({ namespace, schema: stringSchema }),
        ).toThrow("Invalid runtime state namespace");
      }
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

  it("does not expose storage internals or let a scoped handle change its namespace", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    try {
      await service.initialize();
      const first = service.scoped({
        namespace: "first",
        schema: stringSchema,
      });
      const second = service.scoped({
        namespace: "second",
        schema: stringSchema,
      });
      await second.set("key", "second-value");
      const changed = Reflect.set(first, "namespace", "second");
      await first.set("key", "first-value");
      expect(await second.get("key")).toBe("second-value");
      expect(await first.get("key")).toBe("first-value");
      expect(changed).toBe(false);
      expect(Object.keys(first).sort()).toEqual([
        "clear",
        "delete",
        "get",
        "has",
        "list",
        "set",
        "setIfNotExists",
      ]);
      expect(first).not.toHaveProperty("db");
      expect(first).not.toHaveProperty("schema");
      expect(first).not.toHaveProperty("listRows");
      const { get } = first;
      expect(await get("key")).toBe("first-value");
    } finally {
      service.close();
    }
  });

  it("supports atomic insert-if-absent semantics", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    const store = service.scoped({ namespace: "dedupe", schema: stringSchema });

    expect(await store.setIfNotExists("message-1", "first")).toBe(true);
    expect(await store.setIfNotExists("message-1", "second")).toBe(false);
    expect(await store.get("message-1")).toBe("first");
    service.close();
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

  it("persists wire values across restart and parses transforms only at each read boundary", async () => {
    const options = {
      namespace: "transformed",
      schema: z.object({
        n: z.string().transform(Number),
        increment: z.number().transform((n) => n + 1),
        label: z.string().default("ready"),
      }),
    };
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    try {
      const store = service.scoped(options);
      await store.set("one", { n: "7", increment: 1 });
      expect(await store.setIfNotExists("one", { n: "9", increment: 9 })).toBe(
        false,
      );
      expect(await store.setIfNotExists("two", { n: "8", increment: 2 })).toBe(
        true,
      );
      expect(await store.get("one")).toEqual({
        n: 7,
        increment: 2,
        label: "ready",
      });
      expect(await store.get("one")).toEqual({
        n: 7,
        increment: 2,
        label: "ready",
      });
      // @ts-expect-error Writes require schema input, not the transformed result.
      await expectPromiseToReject(store.set("bad", { n: 7, increment: 1 }));
      expect(await store.has("bad")).toBe(false);
    } finally {
      service.close();
    }
    const restarted = RuntimeStateService.createFresh({ url: dbUrl });
    try {
      const store = restarted.scoped(options);
      expect((await store.list()).map((record) => record.value)).toEqual([
        { n: 7, increment: 2, label: "ready" },
        { n: 8, increment: 3, label: "ready" },
      ]);
      expect(await store.clear({ keyPrefix: "one" })).toBe(1);
      expect(await store.get("one")).toBeNull();
      expect(await store.get("two")).toEqual({
        n: 8,
        increment: 3,
        label: "ready",
      });
    } finally {
      restarted.close();
    }
  });

  it("validates JSON round trips before writing, including insert-if-absent", async () => {
    const service = RuntimeStateService.createFresh({ url: dbUrl });
    try {
      const store = service.scoped({ namespace: "wire", schema: z.unknown() });
      await expectPromiseToReject(store.set("bad", undefined));
      await expectPromiseToReject(store.setIfNotExists("bad", 1n));
      expect(await store.has("bad")).toBe(false);
      await store.set("null", 1);
      await store.set("null", null);
      expect(await store.has("null")).toBe(true);
      expect(await store.get("null")).toBeNull();
      expect(await store.setIfNotExists("insert-null", null)).toBe(true);
      expect(await store.has("insert-null")).toBe(true);
      expect(await store.get("insert-null")).toBeNull();
      const date = service.scoped({ namespace: "dates", schema: z.date() });
      // A Date is accepted by the schema before serialization, but cannot be
      // read back through that schema from JSON. Refuse it before persisting.
      await expectPromiseToReject(date.set("bad", new Date()));
      expect(await date.has("bad")).toBe(false);
      await expectPromiseToReject(date.setIfNotExists("bad", new Date()));
      expect(await date.has("bad")).toBe(false);
    } finally {
      service.close();
    }
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
