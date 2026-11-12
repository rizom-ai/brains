import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  type ApplyEntityMutationOnceRequest,
  type EntityMutationReceiptKey,
  type FoldEntityRequest,
  type GetEntityRequest,
  type SearchWithDistancesRequest,
} from "@brains/entity-service";
import { createMockEntityService } from "@brains/entity-service/test";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type BaseEntity,
  type IEntityService,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class makes the entity service's
 * conditional and once-only writes, and its distance search, as its class
 * made them through context.entityService: each request handed on as
 * written, attributed to whoever it names and to nobody otherwise, with no
 * check beyond the store's own. What the store refuses the class, it
 * refuses the converted service the same way.
 */

async function runtimeOn(
  entityService: IEntityService,
): Promise<ServiceRuntime> {
  const shell = createMockShell({ entityService });
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({ id: "probe", config: z.object({}) }),
      (context) => {
        runtime = serviceRuntime(context);
        return [];
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  await plugin?.register(shell);
  if (!runtime) throw new Error("The tools slot did not run");
  return runtime;
}

const faq: BaseEntity = {
  id: "reach",
  entityType: "faq",
  content: "An answer.",
  contentHash: "hash",
  visibility: "public",
  metadata: { question: "How?" },
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};
const receipt: EntityMutationReceiptKey = {
  namespace: "faq.capture",
  key: "m-1",
};

describe("a first-party service's conditional and once-only writes", () => {
  it("hands each one to the entity service as written", async () => {
    const calls: Array<[string, unknown]> = [];
    const base = createMockEntityService();
    const runtime = await runtimeOn({
      ...base,
      getEntityWriteSnapshot: async (request: GetEntityRequest) => {
        calls.push(["getEntityWriteSnapshot", request]);
        return { entity: faq, revision: "r-1" };
      },
      getEntityMutationReceipt: async (key: EntityMutationReceiptKey) => {
        calls.push(["getEntityMutationReceipt", key]);
        return null;
      },
      applyEntityMutationOnce: async (
        request: ApplyEntityMutationOnceRequest,
      ) => {
        calls.push(["applyEntityMutationOnce", request]);
        return { ...request.receipt, operation: "none", entityId: "" };
      },
      foldEntity: async (request: FoldEntityRequest) => {
        calls.push(["foldEntity", request]);
        return { entityId: request.entity.id, jobId: "", skipped: false };
      },
      releaseProjectionOwnership: async (request: {
        entityType: string;
        id: string;
      }) => {
        calls.push(["releaseProjectionOwnership", request]);
      },
      searchWithDistances: async (request: SearchWithDistancesRequest) => {
        calls.push(["searchWithDistances", request]);
        return [{ entityId: "reach", entityType: "faq", distance: 0.1 }];
      },
    });

    const snapshot = {
      entityType: "faq",
      id: "reach",
      visibilityScope: "public",
      publishedOnly: true,
    } as const;
    expect(
      await runtime.entityMutations.getEntityWriteSnapshot(snapshot),
    ).toEqual({ entity: faq, revision: "r-1" });
    expect(
      await runtime.entityMutations.getEntityMutationReceipt(receipt),
    ).toBe(null);
    const once: ApplyEntityMutationOnceRequest = {
      receipt,
      operation: "update",
      request: {
        entity: faq,
        options: { conditionalWrite: { expectedRevision: "r-1" } },
      },
    };
    await runtime.entityMutations.applyEntityMutationOnce(once);
    const fold: FoldEntityRequest = {
      source: { entityType: "faq", id: "dup", expectedRevision: "r-2" },
      targetRevision: "r-1",
      entity: faq,
    };
    await runtime.entityMutations.foldEntity(fold);
    // A retired projection rule's ownership released, as topics released it.
    await runtime.entityMutations.releaseProjectionOwnership({
      entityType: "topic",
      id: "tides",
    });
    const search: SearchWithDistancesRequest = {
      query: "How?",
      types: ["faq"],
      maxDistance: 0.3,
    };
    expect(await runtime.entityReads.searchWithDistances(search)).toEqual([
      { entityId: "reach", entityType: "faq", distance: 0.1 },
    ]);

    // As written: nobody attributed and no option added.
    expect(calls).toEqual([
      ["getEntityWriteSnapshot", snapshot],
      ["getEntityMutationReceipt", receipt],
      ["applyEntityMutationOnce", once],
      ["foldEntity", fold],
      ["releaseProjectionOwnership", { entityType: "topic", id: "tides" }],
      ["searchWithDistances", search],
    ]);
    expect(Object.keys(runtime.entityMutations).sort()).toEqual([
      "applyEntityMutationOnce",
      "foldEntity",
      "getEntityMutationReceipt",
      "getEntityWriteSnapshot",
      "releaseProjectionOwnership",
    ]);
  });
});

describe("a first-party service's once-only writes on the brain's own store", () => {
  const closers: Array<() => void> = [];
  afterEach(() => {
    for (const close of closers.splice(0)) close();
  });

  /** A store holding one type, "note", and the converted service over it. */
  async function store(): Promise<{
    service: EntityService;
    runtime: ServiceRuntime;
  }> {
    const temporary = await createTestDirectory();
    const logger = createSilentLogger();
    const dbConfig = { url: `file:${temporary.dir}/entities.db` };
    await migrateEntities(dbConfig, logger);
    const registry = EntityRegistry.createFresh(logger);
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({
        id: "notes",
        entities: [
          defineEntity({
            type: "note",
            purpose: "A note.",
            metadata: z.object({ title: z.string() }),
          }),
        ],
      }),
      {},
      { name: "@fixture/notes", version: "0.1.0" },
    )) {
      if (plugin instanceof EntityPlugin)
        registry.registerEntityType(
          plugin.entityType,
          plugin.schema,
          plugin.adapter,
          {},
        );
    }
    const service = EntityService.createFresh({
      dbConfig,
      embeddingDbConfig: { url: `file:${temporary.dir}/embeddings.db` },
      entityRegistry: registry,
      logger,
      jobQueueService: createMockShell().getJobQueueService(),
      embeddingsEnabled: false,
      embeddingService: {
        identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
        embedQuery: async () => {
          throw new Error("Unexpected embedding");
        },
        embedDocuments: async () => {
          throw new Error("Unexpected embedding");
        },
      },
    });
    await service.initialize();
    closers.push(() => service.close());
    return { service, runtime: await runtimeOn(service) };
  }

  const note = (
    id: string,
  ): Omit<BaseEntity, "contentHash" | "created" | "updated"> => ({
    id,
    entityType: "note",
    content: "Text.",
    visibility: "public",
    metadata: { title: id },
  });

  it("applies once under its receipt, as the class did", async () => {
    const { service, runtime } = await store();
    const key = { namespace: "probe.once", key: "first" };
    const applied = await runtime.entityMutations.applyEntityMutationOnce({
      receipt: key,
      operation: "create",
      request: { entity: note("one") },
    });
    expect(applied).toMatchObject({ operation: "create", entityId: "one" });
    // The same receipt does nothing a second time.
    expect(
      await runtime.entityMutations.applyEntityMutationOnce({
        receipt: key,
        operation: "create",
        request: { entity: note("two") },
      }),
    ).toMatchObject({ operation: "create", entityId: "one" });
    expect(await service.getEntityMutationReceipt(key)).toMatchObject({
      entityId: "one",
    });
    expect(await service.getEntity({ entityType: "note", id: "two" })).toBe(
      null,
    );
  });

  it("is refused a type the store will not write, as the class was", async () => {
    const { service, runtime } = await store();
    const once: ApplyEntityMutationOnceRequest = {
      receipt: { namespace: "probe.once", key: "ghost" },
      operation: "create",
      request: { entity: { ...note("ghost"), entityType: "ghost" } },
    };
    const direct = await service.applyEntityMutationOnce(once).then(
      () => "applied",
      (error: unknown) => String(error),
    );
    const converted = await runtime.entityMutations
      .applyEntityMutationOnce({
        ...once,
        receipt: { namespace: "probe.once", key: "ghost-2" },
      })
      .then(
        () => "applied",
        (error: unknown) => String(error),
      );
    expect(direct).not.toBe("applied");
    expect(converted).toBe(direct);

    await service.createEntity({ entity: note("target") });
    const target = await service.getEntityWriteSnapshot({
      entityType: "note",
      id: "target",
    });
    if (!target) throw new Error("No target");
    const fold: FoldEntityRequest = {
      source: { entityType: "ghost", id: "gone", expectedRevision: "r" },
      targetRevision: target.revision,
      entity: { ...target.entity, entityType: "ghost" },
    };
    const directFold = await service.foldEntity(fold).then(
      () => "folded",
      (error: unknown) => String(error),
    );
    const convertedFold = await runtime.entityMutations.foldEntity(fold).then(
      () => "folded",
      (error: unknown) => String(error),
    );
    expect(directFold).not.toBe("folded");
    expect(convertedFold).toBe(directFold);
  });
});
