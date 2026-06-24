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
    RuntimeStateService.resetInstance();
    await rm(tempDir, { recursive: true, force: true });
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
