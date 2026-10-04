import { expect, test } from "bun:test";
import { EntityWriteConflictError } from "@brains/entity-service";
import { createMockEntityService } from "../src/test/mock-entity-service";
import { createMockEntityStore } from "../src/test/mock-entity-store";

async function fixture(): Promise<{
  service: ReturnType<typeof createMockEntityService>;
  store: ReturnType<typeof createMockEntityStore>;
}> {
  const store = createMockEntityStore();
  const service = createMockEntityService(store);
  await service.createEntity({
    entity: {
      entityType: "note",
      id: "target",
      content: "Original",
      visibility: "restricted",
      metadata: { count: 1 },
    },
  });
  return { service, store };
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    return error;
  }
}

test("fixture deletion checks full revisions and observes guarded concurrent changes", async () => {
  const { service, store } = await fixture();
  const snapshot = await service.getEntityWriteSnapshot({
    entityType: "note",
    id: "target",
    visibilityScope: "restricted",
  });
  if (!snapshot) throw new Error("Missing fixture");
  const error = await failure(
    service.deleteEntity({
      entityType: "note",
      id: "target",
      options: {
        conditionalWrite: { expectedRevision: snapshot.revision },
        beforeWrite: async () => {
          const current = store.entities.get("target");
          if (!current) throw new Error("Missing current fixture");
          store.entities.set("target", { ...current, metadata: { count: 2 } });
        },
      },
    }),
  );
  expect(error).toBeInstanceOf(EntityWriteConflictError);
  expect(store.entities.get("target")?.metadata["count"]).toBe(2);
  expect(store.sources.has("target")).toBe(true);
});

test("fixture cancellation leaves canonical state and export intents untouched", async () => {
  const { service, store } = await fixture();
  const request = {
    entityType: "note",
    id: "target",
    visibilityScope: "restricted" as const,
  };
  const snapshot = await service.getEntityWriteSnapshot(request);
  if (!snapshot) throw new Error("Missing fixture");
  const before = await service.listPendingEntityExports();
  const controller = new AbortController();
  const error = await failure(
    service.deleteEntity({
      entityType: "note",
      id: "target",
      options: {
        conditionalWrite: { expectedRevision: snapshot.revision },
        signal: controller.signal,
        beforeWrite: async () => {
          controller.abort();
        },
      },
    }),
  );
  expect(error).toBeDefined();
  expect(await service.getEntityWriteSnapshot(request)).toEqual(snapshot);
  expect(await service.listPendingEntityExports()).toEqual(before);
  expect(store.sources.has("target")).toBe(true);
});

test("fixture guarded deletion removes only the admitted type and version", async () => {
  const { service } = await fixture();
  const snapshot = await service.getEntityWriteSnapshot({
    entityType: "note",
    id: "target",
    visibilityScope: "restricted",
  });
  if (!snapshot) throw new Error("Missing fixture");
  expect(
    await service.deleteEntity({ entityType: "other", id: "target" }),
  ).toBe(false);
  expect(
    await service.deleteEntity({
      entityType: "note",
      id: "target",
      options: { conditionalWrite: { expectedRevision: snapshot.revision } },
    }),
  ).toBe(true);
  expect(
    await service.getEntityWriteSnapshot({
      entityType: "note",
      id: "target",
      visibilityScope: "restricted",
    }),
  ).toBeNull();
  expect(await service.deleteEntity({ entityType: "note", id: "target" })).toBe(
    false,
  );
});
