import { expect, test } from "bun:test";
import {
  type ApplyEntityMutationOnceRequest,
  EntityWriteConflictError,
  entityRevision,
} from "@brains/entity-service";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";

function fixture(): {
  store: ReturnType<typeof createMockEntityStore>;
  service: ReturnType<typeof createMockEntityService>;
  request: ApplyEntityMutationOnceRequest;
} {
  const store = createMockEntityStore();
  return {
    store,
    service: createMockEntityService(store),
    request: {
      receipt: { namespace: "test", key: "capture" },
      operation: "create",
      request: {
        entity: {
          entityType: "note",
          id: "target",
          content: "Answer",
          visibility: "restricted",
          metadata: {},
        },
      },
    },
  };
}

test("receipt double shares detached durable results across service instances and deletion", async () => {
  const { service, store, request } = fixture();
  const result = await service.applyEntityMutationOnce(request);
  if (result.operation === "none") throw new Error("Expected write");
  result.entityId = "mutated";
  const expected = {
    operation: "create" as const,
    entityType: "note",
    entityId: "target",
  };
  const other = createMockEntityService(store);
  await other.deleteEntity({ entityType: "note", id: "target" });
  const exports = structuredClone([...store.exportIntents]);
  expect(await other.applyEntityMutationOnce(request)).toEqual(expected);
  expect(await service.getEntityMutationReceipt(request.receipt)).toEqual(
    expected,
  );
  expect([...store.entities]).toHaveLength(0);
  expect([...store.exportIntents]).toEqual(exports);
});

test("a competing terminal decision wins while a fake guard is suspended", async () => {
  const { service, store, request } = fixture();
  if (request.operation !== "create") throw new Error("Expected create");
  const started = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  request.request.options = {
    beforeWrite: async (): Promise<void> => {
      started.resolve();
      await resume.promise;
    },
  };
  const pending = service.applyEntityMutationOnce(request);
  await started.promise;
  await service.applyEntityMutationOnce({
    operation: "none",
    receipt: request.receipt,
  });
  resume.resolve();
  expect(await pending).toEqual({ operation: "none" });
  expect(store.entities.size).toBe(0);
  expect(store.exportIntents.size).toBe(0);
});

test("a guard rejection does not consume a fake receipt", async () => {
  const { service, store, request } = fixture();
  if (request.operation !== "create") throw new Error("Expected create");
  request.request.options = {
    beforeWrite: async (): Promise<void> => {
      throw new Error("Refused");
    },
  };
  expect(
    await service
      .applyEntityMutationOnce(request)
      .catch((error: unknown) => error),
  ).toBeInstanceOf(Error);
  expect(await service.getEntityMutationReceipt(request.receipt)).toBeNull();
  expect(store.entities.size).toBe(0);
  expect(store.exportIntents.size).toBe(0);
});

test("a metadata race refuses a fake update without a receipt", async () => {
  const { service, store, request } = fixture();
  await service.applyEntityMutationOnce(request);
  const current = store.entities.get("target");
  if (!current) throw new Error("Missing target");
  const update: ApplyEntityMutationOnceRequest = {
    receipt: { ...request.receipt, key: "update" },
    operation: "update",
    request: {
      entity: { ...current, content: "Changed answer" },
      options: {
        conditionalWrite: { expectedRevision: entityRevision(current) },
        beforeWrite: async () => {
          await service.updateEntity({
            entity: { ...current, metadata: { other: true } },
          });
        },
      },
    },
  };
  expect(
    await service
      .applyEntityMutationOnce(update)
      .catch((error: unknown) => error),
  ).toBeInstanceOf(EntityWriteConflictError);
  expect(await service.getEntityMutationReceipt(update.receipt)).toBeNull();
  expect(store.entities.get("target")?.content).toBe("Answer");
});

test("fake receipt keys are scoped without delimiter collisions", async () => {
  const { service, request } = fixture();
  await service.applyEntityMutationOnce({
    ...request,
    receipt: { namespace: "a\u0000b", key: "c" },
  });
  expect(
    await service.getEntityMutationReceipt({ namespace: "a", key: "b\u0000c" }),
  ).toBeNull();
});
