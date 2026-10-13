import { describe, expect, it } from "bun:test";
import {
  EntityWriteConflictError,
  type FoldEntityRequest,
  type EntityWriteSnapshot,
  type IEntityService,
} from "@brains/entity-service";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";

async function fixture(): Promise<{
  store: ReturnType<typeof createMockEntityStore>;
  service: IEntityService;
  request: FoldEntityRequest;
  source: EntityWriteSnapshot;
  target: EntityWriteSnapshot;
}> {
  const store = createMockEntityStore();
  const service = createMockEntityService(store);
  for (const id of ["source", "target"])
    await service.createEntity({
      entity: {
        entityType: "note",
        id,
        content: id,
        visibility: "restricted",
        metadata: {},
      },
    });
  const source = await service.getEntityWriteSnapshot({
    entityType: "note",
    id: "source",
    visibilityScope: "restricted",
  });
  const target = await service.getEntityWriteSnapshot({
    entityType: "note",
    id: "target",
    visibilityScope: "restricted",
  });
  if (!source || !target) throw new Error("Missing fixture");
  const request: FoldEntityRequest = {
    source: {
      entityType: "note",
      id: "source",
      expectedRevision: source.revision,
    },
    targetRevision: target.revision,
    entity: { ...target.entity, content: "combined" },
  };
  return { store, service, request, source, target };
}

describe("stateful native fold double", () => {
  it("consumes the source once and records both export intents", async () => {
    const { store, service, request } = await fixture();
    await service.foldEntity(request);
    expect(store.entities.has("source")).toBe(false);
    expect(store.entities.get("target")?.content).toBe("combined");
    expect(
      [...store.exportIntents.values()]
        .map(({ entityId, operation }) => [entityId, operation])
        .sort(),
    ).toEqual([
      ["source", "delete"],
      ["target", "upsert"],
    ]);
    expect(
      await service.foldEntity(request).catch((error: unknown) => error),
    ).toBeInstanceOf(EntityWriteConflictError);
  });

  it.each(["source", "target"] as const)(
    "rejects changed %s including metadata-only changes",
    async (id) => {
      const { store, service, request, source, target } = await fixture();
      const observed = id === "source" ? source : target;
      await service.updateEntity({
        entity: { ...observed.entity, metadata: { changed: true } },
      });
      const before = structuredClone([...store.entities]);
      expect(
        await service.foldEntity(request).catch((error: unknown) => error),
      ).toBeInstanceOf(EntityWriteConflictError);
      expect([...store.entities]).toEqual(before);
    },
  );

  it("leaves both entities and journals unchanged when the guard refuses", async () => {
    const { store, service, request } = await fixture();
    const before = structuredClone([...store.entities]);
    const exports = structuredClone([...store.exportIntents]);
    request.options = {
      beforeWrite: async (): Promise<void> => {
        throw new Error("refused");
      },
    };
    expect(
      await service.foldEntity(request).catch((error: unknown) => error),
    ).toMatchObject({ message: "refused" });
    expect([...store.entities]).toEqual(before);
    expect([...store.exportIntents]).toEqual(exports);
  });

  it("returns detached snapshots", async () => {
    const { source, store } = await fixture();
    source.entity.content = "changed caller copy";
    expect(store.entities.get("source")?.content).toBe("source");
  });
});
