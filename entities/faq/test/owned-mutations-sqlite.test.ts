import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { EntityService } from "@brains/entity-service";
import { createTestDirectory } from "@brains/test-utils";
import { createTestEntityAccess } from "@brains/plugins/test";
import type { OwnedEntityMutations } from "@brains/sdk/entities";
import { faq as faqEntity } from "../src/faq-entity";
import { prepareFaqMerge } from "../src/lib/faq-merge";
import { reconcileFaq } from "../src/lib/reconcile-faq";
import { openFoldStorage, readFold, seedFold } from "./helpers/fold-storage";

const scope = { visibilityScope: "restricted" } as const;

describe("owned FAQ mutations on real SQLite", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let service: EntityService;
  const access = (): OwnedEntityMutations =>
    createTestEntityAccess({
      entityService: service,
      ownedTypes: ["faq"],
      owner: "@brains/faq",
      declarationId: "capture",
    }).mutations;
  beforeEach(async () => {
    directory = await createTestDirectory("owned-faq");
    service = await openFoldStorage(directory.dir);
    await service.initialize();
    await seedFold(service);
  });
  afterEach(async () => {
    service.close();
    await directory.cleanup();
  });

  it("commits an update with the native receipt identity and survives deletion/reopening", async () => {
    const mutations = access();
    const edit = await mutations.read(faqEntity, "target", scope);
    if (!edit) throw new Error("Missing target");
    const winner = await mutations
      .once(faqEntity, "capture", "reply")
      .complete({
        operation: "update",
        edit,
        entity: prepareFaqMerge(edit.entity, { asks: 1 }),
      });
    expect(winner).toEqual({ operation: "update", entityId: "target" });
    expect((await readFold(service, "target"))?.metadata.asked).toBe(4);
    expect(
      await service.getEntityMutationReceipt({
        namespace: "faq.capture",
        key: "reply",
      }),
    ).toEqual({ operation: "update", entityType: "faq", entityId: "target" });
    await service.deleteEntity({ entityType: "faq", id: "target" });
    service.close();
    service = await openFoldStorage(directory.dir);
    await service.initialize();
    const retry = access().once(faqEntity, "capture", "reply");
    expect(await retry.get()).toEqual(winner);
    expect(await retry.complete({ operation: "none" })).toEqual(winner);
    expect(await readFold(service, "target")).toBeNull();
  });

  it("does not consume a receipt when metadata changed without a content change", async () => {
    const mutations = access();
    const edit = await mutations.read(faqEntity, "target", scope);
    if (!edit) throw new Error("Missing target");
    await service.updateEntity({
      entity: {
        ...edit.entity,
        metadata: { ...edit.entity.metadata, rank: 7 },
      },
    });
    const operation = mutations.once(faqEntity, "capture", "reply");
    const error = await operation
      .complete({
        operation: "update",
        edit,
        entity: prepareFaqMerge(edit.entity, { asks: 1 }),
      })
      .catch((cause: unknown): unknown => cause);
    expect(error).toMatchObject({ code: "conflict" });
    expect(await operation.get()).toBeNull();
    expect((await readFold(service, "target"))?.metadata.asked).toBe(3);
  });

  it("folds the pinned pair and never compensates a lost post-commit acknowledgement", async () => {
    const mutations = access();
    const source = await mutations.read(faqEntity, "source", scope);
    const target = await mutations.read(faqEntity, "target", scope);
    if (!source || !target) throw new Error("Missing pair");
    const fold = service.foldEntity.bind(service);
    spyOn(service, "foldEntity").mockImplementationOnce(async (request) => {
      await fold(request);
      throw new Error("Private lost acknowledgement");
    });
    const error = await mutations
      .fold(
        faqEntity,
        source,
        target,
        prepareFaqMerge(target.entity, { asks: source.entity.metadata.asked }),
      )
      .catch((cause: unknown): unknown => cause);
    expect(error).toMatchObject({
      code: "handler_failed",
      cause: { message: "Private lost acknowledgement" },
    });
    expect(JSON.stringify(error)).not.toContain("Private");
    expect(await mutations.read(faqEntity, "source", scope)).toBeNull();
    expect((await readFold(service, "target"))?.metadata.asked).toBe(5);
  });

  it("keeps both entities when a target revision changes before folding", async () => {
    const mutations = access();
    const source = await mutations.read(faqEntity, "source", scope);
    const target = await mutations.read(faqEntity, "target", scope);
    if (!source || !target) throw new Error("Missing pair");
    await service.updateEntity({
      entity: prepareFaqMerge(target.entity, { asks: 1 }),
    });
    const error = await mutations
      .fold(
        faqEntity,
        source,
        target,
        prepareFaqMerge(target.entity, { asks: 2 }),
      )
      .catch((cause: unknown): unknown => cause);
    expect(error).toMatchObject({ code: "conflict" });
    expect((await readFold(service, "source"))?.metadata.asked).toBe(2);
    expect((await readFold(service, "target"))?.metadata.asked).toBe(4);
  });

  it("runs reconciliation through issued edits and retries a same-question target change once", async () => {
    const mutations = access();
    const fold = service.foldEntity.bind(service);
    spyOn(service, "foldEntity").mockImplementationOnce(async (request) => {
      const current = await readFold(service, "target");
      if (!current) throw new Error("Missing target");
      await service.updateEntity({
        entity: prepareFaqMerge(current, { asks: 1 }),
      });
      return fold(request);
    });
    expect(
      await reconcileFaq("source", {
        read: (id, visibilityScope) =>
          mutations.read(faqEntity, id, { visibilityScope }),
        findSame: async () => (await readFold(service, "target")) ?? undefined,
        fold: (source, target, entity) =>
          mutations.fold(faqEntity, source, target, entity),
      }),
    ).toEqual({ outcome: "folded", into: "target" });
    expect(await readFold(service, "source")).toBeNull();
    expect((await readFold(service, "target"))?.metadata.asked).toBe(6);
  });

  it("runs native write guards and leaves a refused capture retryable", async () => {
    const mutations = access();
    const edit = await mutations.read(faqEntity, "target", scope);
    if (!edit) throw new Error("Missing target");
    const apply = service.applyEntityMutationOnce.bind(service);
    spyOn(service, "applyEntityMutationOnce").mockImplementationOnce(
      async (request) => {
        if (request.operation !== "update")
          throw new Error("Expected update fixture");
        return apply({
          ...request,
          request: {
            ...request.request,
            options: {
              ...request.request.options,
              beforeWrite: async (): Promise<void> => {
                throw new Error("Private policy refusal");
              },
            },
          },
        });
      },
    );
    const operation = mutations.once(faqEntity, "capture", "reply");
    const proposal = {
      operation: "update" as const,
      edit,
      entity: prepareFaqMerge(edit.entity, { asks: 1 }),
    };
    expect(
      await operation
        .complete(proposal)
        .catch((cause: unknown): unknown => cause),
    ).toMatchObject({ code: "handler_failed" });
    expect(await operation.get()).toBeNull();
    expect((await readFold(service, "target"))?.metadata.asked).toBe(3);
    expect(await operation.complete(proposal)).toEqual({
      operation: "update",
      entityId: "target",
    });
    expect((await readFold(service, "target"))?.metadata.asked).toBe(4);
  });
});
