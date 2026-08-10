import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import {
  RemoteRuntimeStateService,
  RuntimeStateService,
  handleRuntimeStateRpcRequest,
  type RuntimeStateRpcRequest,
  type RuntimeStateRpcTransport,
} from "../src";
import { migrateRuntimeState } from "../src/migrate";

class DirectRuntimeStateTransport implements RuntimeStateRpcTransport {
  private readonly owner: RuntimeStateService;
  public initialized = false;

  public constructor(owner: RuntimeStateService) {
    this.owner = owner;
  }

  public async initialize(): Promise<void> {
    this.initialized = true;
  }

  public request(payload: RuntimeStateRpcRequest): Promise<unknown> {
    return handleRuntimeStateRpcRequest(this.owner, payload);
  }

  public close(): void {}
}

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  return promise.then<never, Error>(
    () => {
      throw new Error("Expected promise to reject");
    },
    (error) => error as Error,
  );
}

describe("runtime state owner RPC", () => {
  let tempDir: string;
  let owner: RuntimeStateService;
  let remote: RemoteRuntimeStateService;
  let transport: DirectRuntimeStateTransport;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brains-runtime-state-rpc-"));
    const url = `file:${join(tempDir, "owner-runtime-state.db")}`;
    await migrateRuntimeState({ url });
    owner = RuntimeStateService.createFresh({ url });
    transport = new DirectRuntimeStateTransport(owner);
    remote = new RemoteRuntimeStateService(transport);
    await Promise.all([owner.initialize(), remote.initialize()]);
  });

  afterEach(async () => {
    remote.close();
    owner.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("routes scoped operations and restores explicit record dates", async () => {
    const remoteStore = remote.scoped({
      namespace: "worker.projection.state",
      schema: z.object({ status: z.string() }),
    });
    const ownerStore = owner.scoped({
      namespace: "worker.projection.state",
      schema: z.object({ status: z.string() }),
    });

    expect(transport.initialized).toBe(true);
    expect(
      await remoteStore.setIfNotExists("item:1", { status: "queued" }),
    ).toBe(true);
    expect(
      await remoteStore.setIfNotExists("item:1", { status: "ignored" }),
    ).toBe(false);
    await remoteStore.set("item:2", { status: "ready" });

    expect(await ownerStore.get("item:1")).toEqual({ status: "queued" });
    expect(await remoteStore.has("item:2")).toBe(true);
    const listed = await remoteStore.list({ keyPrefix: "item:" });
    expect(listed.map((record) => record.key).sort()).toEqual([
      "item:1",
      "item:2",
    ]);
    expect(listed.every((record) => record.createdAt instanceof Date)).toBe(
      true,
    );
    expect(listed.every((record) => record.updatedAt instanceof Date)).toBe(
      true,
    );

    expect(await remoteStore.delete("item:1")).toBe(true);
    expect(await remoteStore.clear({ keyPrefix: "item:" })).toBe(1);
    expect(await remoteStore.get("item:2")).toBeNull();
  });

  it("keeps schema validation in the worker facade", async () => {
    const store = remote.scoped({
      namespace: "worker.validated",
      schema: z.object({ count: z.number().int().nonnegative() }),
    });

    const invalidWrite = await captureRejection(
      store.set("invalid", { count: -1 }),
    );
    expect(invalidWrite.name).toBe("ZodError");

    const ownerStore = owner.scoped({
      namespace: "worker.validated",
      schema: z.unknown(),
    });
    await ownerStore.set("invalid-read", { count: "wrong" });
    const invalidRead = await captureRejection(store.get("invalid-read"));
    expect(invalidRead.name).toBe("ZodError");
  });

  it("rejects malformed operations before owner dispatch", async () => {
    const error = await captureRejection(
      handleRuntimeStateRpcRequest(owner, {
        operation: "set",
        namespace: "invalid namespace",
        key: "key",
        value: "value",
      }),
    );
    expect(error.name).toBe("ZodError");
  });
});
