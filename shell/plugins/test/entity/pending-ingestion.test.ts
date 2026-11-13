import { describe, expect, mock, test } from "bun:test";
import type { BaseEntity, EntityMutationResult } from "@brains/entity-service";
import { createPendingEntity } from "../../src/entity/pending-ingestion";

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
});
