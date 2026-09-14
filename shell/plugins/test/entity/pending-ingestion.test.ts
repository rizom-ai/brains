import { describe, expect, mock, test } from "bun:test";
import assert from "node:assert/strict";
import { prepareAsset } from "@brains/assets";
import type { BaseEntity, EntityMutationResult } from "@brains/entity-service";
import {
  createPendingEntity,
  failPendingEntity,
  saveProcessedEntity,
} from "../../src/entity/pending-ingestion";

const mutation = (entityId: string): EntityMutationResult => ({
  entityId,
  jobId: `job-${entityId}`,
  skipped: false,
});

const makeEntity = (overrides: Partial<BaseEntity> = {}): BaseEntity => ({
  id: "item-1",
  entityType: "test",
  content: "pending content",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
  visibility: "public",
  metadata: { status: "pending", title: "Item 1" },
  contentHash: "hash-1",
  ...overrides,
});

describe("pending ingestion helpers", () => {
  test("cancellation during pending lookup prevents file publication", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const abort = new AbortController();
    const primary = new Error("job cancelled during lookup");
    const publish = mock(async (_request: unknown) => mutation("item-1"));
    const unused = async (): Promise<never> => {
      throw new Error("Unexpected operation");
    };
    const entityService = {
      getEntity: async (): Promise<BaseEntity> => {
        entered.resolve();
        await release.promise;
        return makeEntity();
      },
      createEntity: unused,
      updateEntity: unused,
      fileAssets: {
        publish,
        inspect: unused,
        fingerprint: unused,
        download: unused,
        close: async (): Promise<void> => undefined,
      },
    };
    const pending = saveProcessedEntity({
      entityService,
      entity: makeEntity(),
      fileAsset: { sourceFile: "/trusted/pinned", sizeBytes: 1 },
      signal: abort.signal,
    });
    const rejected = assert.rejects(
      pending,
      (error: unknown) => error === primary,
    );
    await entered.promise;
    abort.abort(primary);
    release.resolve();
    await rejected;
    expect(publish).not.toHaveBeenCalled();
  });

  test("processed files preserve pending identity, visibility and content guards without byte handoffs", async () => {
    const existing = makeEntity({ visibility: "shared" });
    const publish = mock(async (_request: unknown) => mutation("item-1"));
    const unused = async (): Promise<never> => {
      throw new Error("Unexpected buffered operation");
    };
    const entityService = {
      getEntity: async (): Promise<BaseEntity> => existing,
      createEntity: unused,
      updateEntity: unused,
      fileAssets: {
        publish,
        inspect: unused,
        fingerprint: unused,
        download: unused,
        close: async (): Promise<void> => undefined,
      },
    };
    const fileAsset = { sourceFile: "/trusted/pinned", sizeBytes: 1 };
    const result = await saveProcessedEntity({
      entityService,
      entity: {
        id: "item-1",
        entityType: "test",
        content: "asset://sha256/test",
        metadata: { status: "draft" },
        updated: "2026-02-01T00:00:00.000Z",
      },
      fileAsset,
      expectedContentHash: "hash-1",
    });
    expect(result.updated).toBe(true);
    expect(publish.mock.calls[0]?.[0]).toEqual({
      ...fileAsset,
      publication: {
        operation: "updateEntity",
        request: {
          entity: {
            ...existing,
            content: "asset://sha256/test",
            metadata: { status: "draft" },
            updated: "2026-02-01T00:00:00.000Z",
          },
          options: { expectedContentHash: "hash-1" },
        },
      },
    });
  });

  test("processed file requests reject missing capabilities and mixed bytes before lookup", async () => {
    const getEntity = mock(async () => null);
    const entityService = {
      getEntity,
      createEntity: mock(async () => mutation("unexpected")),
      updateEntity: mock(async () => mutation("unexpected")),
    };
    const input = {
      entityService,
      entity: {
        id: "item-1",
        entityType: "test",
        content: "asset://sha256/test",
        metadata: {},
      },
      fileAsset: { sourceFile: "/trusted/pinned", sizeBytes: 1 },
    };
    await assert.rejects(saveProcessedEntity(input), /not provisioned/);
    await assert.rejects(
      saveProcessedEntity({
        ...input,
        preparedAsset: prepareAsset(new Uint8Array([1])),
      }),
      /mixed/,
    );
    expect(getEntity).not.toHaveBeenCalled();
  });

  test("createPendingEntity creates a durable placeholder when missing", async () => {
    const createEntity = mock(async (_request: unknown) => mutation("item-1"));
    const entityService = {
      getEntity: mock(async () => null),
      createEntity,
      updateEntity: mock(async (_request: unknown) => mutation("unexpected")),
    };

    const result = await createPendingEntity({
      entityService,
      entity: {
        id: "item-1",
        entityType: "test",
        content: "pending content",
        metadata: { status: "pending", title: "Item 1" },
      },
    });

    expect(result).toEqual({
      entityId: "item-1",
      created: true,
      mutation: mutation("item-1"),
    });
    expect(createEntity).toHaveBeenCalledTimes(1);
    expect(createEntity.mock.calls[0]?.[0]).toEqual({
      entity: {
        id: "item-1",
        entityType: "test",
        content: "pending content",
        metadata: { status: "pending", title: "Item 1" },
      },
    });
  });

  test("createPendingEntity is idempotent when placeholder already exists", async () => {
    const existing = makeEntity();
    const entityService = {
      getEntity: mock(async () => existing),
      createEntity: mock(async (_request: unknown) => mutation("unexpected")),
      updateEntity: mock(async (_request: unknown) => mutation("unexpected")),
    };

    const result = await createPendingEntity({
      entityService,
      entity: {
        id: "item-1",
        entityType: "test",
        content: "ignored",
        metadata: { status: "pending" },
      },
    });

    expect(result).toEqual({
      entityId: "item-1",
      created: false,
      existingEntity: existing,
    });
    expect(entityService.createEntity).not.toHaveBeenCalled();
  });

  test("saveProcessedEntity updates an existing non-public pending entity", async () => {
    const existing = makeEntity({ visibility: "shared" });
    const updateEntity = mock(async (_request: unknown) => mutation("item-1"));
    const entityService = {
      getEntity: mock(async (request: { visibilityScope?: string }) =>
        request.visibilityScope === "restricted" ? existing : null,
      ),
      createEntity: mock(async (_request: unknown) => mutation("unexpected")),
      updateEntity,
    };

    const result = await saveProcessedEntity({
      entityService,
      entity: {
        id: "item-1",
        entityType: "test",
        content: "processed content",
        metadata: { status: "draft", title: "Processed" },
        updated: "2026-01-02T00:00:00.000Z",
      },
    });

    expect(result).toEqual({
      entityId: "item-1",
      updated: true,
      mutation: mutation("item-1"),
      previousEntity: existing,
    });
    expect(entityService.getEntity).toHaveBeenCalledWith({
      entityType: "test",
      id: "item-1",
      visibilityScope: "restricted",
    });
    expect(updateEntity).toHaveBeenCalledTimes(1);
    expect(updateEntity.mock.calls[0]?.[0]).toEqual({
      entity: {
        ...existing,
        content: "processed content",
        metadata: { status: "draft", title: "Processed" },
        updated: "2026-01-02T00:00:00.000Z",
      },
    });
    expect(entityService.createEntity).not.toHaveBeenCalled();
  });

  test("saveProcessedEntity creates processed entity when no placeholder exists", async () => {
    const createEntity = mock(async (_request: unknown) => mutation("item-1"));
    const entityService = {
      getEntity: mock(async () => null),
      createEntity,
      updateEntity: mock(async (_request: unknown) => mutation("unexpected")),
    };

    const result = await saveProcessedEntity({
      entityService,
      entity: {
        id: "item-1",
        entityType: "test",
        content: "processed content",
        metadata: { status: "draft", title: "Processed" },
      },
    });

    expect(result).toEqual({
      entityId: "item-1",
      updated: false,
      mutation: mutation("item-1"),
    });
    expect(createEntity).toHaveBeenCalledTimes(1);
    expect(entityService.updateEntity).not.toHaveBeenCalled();
  });

  test("failPendingEntity marks an existing placeholder as failed", async () => {
    const existing = makeEntity();
    const updateEntity = mock(async (_request: unknown) => mutation("item-1"));
    const entityService = {
      getEntity: mock(async () => existing),
      updateEntity,
    };

    const result = await failPendingEntity({
      entityService,
      entityType: "test",
      id: "item-1",
      error: "OCR failed",
      content: "Processing failed.",
    });

    expect(result).toEqual({
      found: true,
      entityId: "item-1",
      mutation: mutation("item-1"),
      previousEntity: existing,
    });
    expect(updateEntity).toHaveBeenCalledTimes(1);
    expect(updateEntity.mock.calls[0]?.[0]).toMatchObject({
      entity: {
        id: existing.id,
        entityType: existing.entityType,
        content: "Processing failed.",
        metadata: {
          status: "failed",
          title: "Item 1",
          processingError: "OCR failed",
        },
      },
    });
  });

  test("failPendingEntity is a no-op when the placeholder is missing", async () => {
    const entityService = {
      getEntity: mock(async () => null),
      updateEntity: mock(async (_request: unknown) => mutation("unexpected")),
    };

    const result = await failPendingEntity({
      entityService,
      entityType: "test",
      id: "missing",
      error: "OCR failed",
    });

    expect(result).toEqual({ found: false });
    expect(entityService.updateEntity).not.toHaveBeenCalled();
  });
});
