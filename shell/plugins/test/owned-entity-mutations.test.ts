import { describe, expect, it, spyOn } from "bun:test";
import {
  baseEntityParserSchema,
  type BaseEntity,
  type ContentVisibility,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createJobEntityAccess as createAccess } from "../src/job/job-entity-access";
import { createOwnedEntityMutationRuntime } from "../src/internal/owned-entity-mutations";
import { defineEntity } from "../src";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";

function hostMutations(
  service: ReturnType<typeof createMockEntityService>,
  owned: ReadonlySet<string>,
  packageName: string,
  visibilityScope?: ContentVisibility,
): { mutations: ReturnType<typeof createOwnedEntityMutationRuntime> } {
  return {
    mutations: createOwnedEntityMutationRuntime(
      service,
      owned,
      { packageName, declarationId: "capture" },
      visibilityScope,
    ),
  };
}

async function fixture(): Promise<{
  store: ReturnType<typeof createMockEntityStore>;
  service: ReturnType<typeof createMockEntityService>;
  owned: Set<string>;
  access: ReturnType<typeof hostMutations>;
  mutations: ReturnType<typeof hostMutations>["mutations"];
}> {
  const store = createMockEntityStore();
  const service = createMockEntityService(store);
  for (const id of ["source", "target"])
    await service.createEntity({
      entity: {
        entityType: "note",
        id,
        content: id,
        visibility: "public",
        metadata: { count: 1, nested: { label: "original" } },
      },
    });
  const owned = new Set(["note"]);
  const access = hostMutations(service, owned, "@fixture/notes");
  return {
    store,
    service,
    owned,
    access,
    mutations: access.mutations,
  };
}

async function failed(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown): unknown => error);
}

describe("host-owned entity mutation runtime", () => {
  it("reads detached frozen canonical fields, not enriched display metadata", async () => {
    const { service, mutations } = await fixture();
    spyOn(service, "getEntity").mockImplementation(async () => {
      throw new Error("Do not read display");
    });
    const edit = await mutations.read(
      { entityType: "note", id: "source" },
      baseEntityParserSchema,
    );
    expect(edit?.entity.metadata).toEqual({
      count: 1,
      nested: { label: "original" },
    });
    expect(Object.isFrozen(edit)).toBe(true);
    expect(Object.isFrozen(edit?.entity.metadata["nested"])).toBe(true);
    expect(edit && "revision" in edit).toBe(false);
  });

  it("pins installed ownership and refuses caller-scoped callbacks", async () => {
    const { service, owned, mutations } = await fixture();
    owned.add("foreign");
    const ordinary = createAccess(
      service,
      new Set(["note"]),
      "capture",
    ).mutations;
    expect(
      await failed(
        ordinary.read(
          defineEntity({
            type: "note",
            purpose: "Owned fixture",
            metadata: z.object({}),
          }),
          "source",
        ),
      ),
    ).toMatchObject({ code: "permission_denied" });
    expect(
      await failed(
        mutations.read(
          { entityType: "foreign", id: "source" },
          baseEntityParserSchema,
        ),
      ),
    ).toMatchObject({ code: "permission_denied" });
    for (const scope of ["public", "shared", "restricted"] as const) {
      const bound = hostMutations(
        service,
        new Set(["note"]),
        "@fixture/notes",
        scope,
      ).mutations;
      expect(
        await failed(
          bound.read(
            { entityType: "note", id: "source", visibilityScope: "restricted" },
            baseEntityParserSchema,
          ),
        ),
      ).toMatchObject({ code: "permission_denied" });
      expect(() => bound.once("note", "capture", "reply")).toThrow();
    }
  });

  it("does not read a more private owned row at a narrower requested scope", async () => {
    const { service, mutations } = await fixture();
    await service.createEntity({
      entity: {
        entityType: "note",
        id: "secret",
        content: "private",
        metadata: {},
        visibility: "restricted",
      },
    });
    expect(
      await mutations.read(
        { entityType: "note", id: "secret" },
        baseEntityParserSchema,
      ),
    ).toBeNull();
    expect(
      await mutations.read(
        { entityType: "note", id: "secret", visibilityScope: "restricted" },
        baseEntityParserSchema,
      ),
    ).not.toBeNull();
  });

  it("refuses copied and other-access edit credentials", async () => {
    const { service, mutations } = await fixture();
    const edit = await mutations.read(
      { entityType: "note", id: "source" },
      baseEntityParserSchema,
    );
    if (!edit) throw new Error("Missing fixture");
    expect(
      await failed(mutations.replace({ ...edit }, edit.entity)),
    ).toMatchObject({ code: "invalid_input" });
    const other = hostMutations(
      service,
      new Set(["note"]),
      "@fixture/notes",
    ).mutations;
    expect(await failed(other.replace(edit, edit.entity))).toMatchObject({
      code: "invalid_input",
    });
    expect(
      await failed(mutations.replace(edit, { ...edit.entity, id: "target" })),
    ).toMatchObject({ code: "invalid_input" });
  });

  it("uses the full canonical revision, including metadata-only changes", async () => {
    const { service, mutations } = await fixture();
    const edit = await mutations.read(
      { entityType: "note", id: "source" },
      baseEntityParserSchema,
    );
    if (!edit) throw new Error("Missing fixture");
    await service.updateEntity({
      entity: { ...edit.entity, metadata: { count: 2 } },
    });
    const failure = await failed(
      mutations.replace(edit, { ...edit.entity, content: "stale" }),
    );
    expect(failure).toMatchObject({
      code: "conflict",
      cause: { name: "EntityWriteConflictError" },
    });
    expect(JSON.stringify(failure)).not.toContain("note/source");
    expect(
      (await service.getEntity({ entityType: "note", id: "source" }))?.content,
    ).toBe("source");
  });

  it("folds atomically and rejects a stale source without changing the target", async () => {
    const { service, mutations } = await fixture();
    const source = await mutations.read(
      { entityType: "note", id: "source" },
      baseEntityParserSchema,
    );
    const target = await mutations.read(
      { entityType: "note", id: "target" },
      baseEntityParserSchema,
    );
    if (!source || !target) throw new Error("Missing fixtures");
    await service.updateEntity({
      entity: { ...source.entity, metadata: { count: 7 } },
    });
    expect(
      await failed(
        mutations.fold(source, target, { ...target.entity, content: "merged" }),
      ),
    ).toMatchObject({ code: "conflict" });
    expect(
      (await service.getEntity({ entityType: "note", id: "target" }))?.content,
    ).toBe("target");
    const fresh = await mutations.read(
      { entityType: "note", id: "source" },
      baseEntityParserSchema,
    );
    if (!fresh) throw new Error("Missing source");
    await mutations.fold(fresh, target, {
      ...target.entity,
      content: "merged",
    });
    expect(
      await service.getEntity({ entityType: "note", id: "source" }),
    ).toBeNull();
    expect(
      (await service.getEntity({ entityType: "note", id: "target" }))?.content,
    ).toBe("merged");
  });

  it("refuses same-record folds and a visibility change in the destination", async () => {
    const { mutations } = await fixture();
    const source = await mutations.read(
      { entityType: "note", id: "source" },
      baseEntityParserSchema,
    );
    const target = await mutations.read(
      { entityType: "note", id: "target" },
      baseEntityParserSchema,
    );
    if (!source || !target) throw new Error("Missing fixtures");
    expect(
      await failed(mutations.fold(source, source, source.entity)),
    ).toMatchObject({ code: "invalid_input" });
    expect(
      await failed(
        mutations.fold(source, target, {
          ...target.entity,
          visibility: "restricted",
        }),
      ),
    ).toMatchObject({ code: "invalid_input" });
  });

  it("validates schema output and does not let a parser alter the held CAS state", async () => {
    const { mutations } = await fixture();
    const schema = baseEntityParserSchema.transform((entity): BaseEntity => ({
      ...entity,
      id: "target",
    }));
    expect(
      await failed(
        mutations.read({ entityType: "note", id: "source" }, schema),
      ),
    ).toMatchObject({ code: "invalid_response" });
  });

  it("preserves native FAQ receipts without granting other owner/type/operation identities", async () => {
    const { service } = await fixture();
    await service.applyEntityMutationOnce({
      receipt: { namespace: "faq.capture", key: "reply" },
      operation: "none",
    });
    const faq = hostMutations(
      service,
      new Set(["faq", "note"]),
      "@brains/faq",
    ).mutations;
    expect(await faq.once("faq", "capture", "reply").get()).toEqual({
      operation: "none",
    });
    expect(await faq.once("note", "capture", "reply").get()).toBeNull();
    expect(await faq.once("faq", "faq.capture", "reply").get()).toBeNull();
    const other = hostMutations(
      service,
      new Set(["faq"]),
      "@fixture/faq",
    ).mutations;
    expect(await other.once("faq", "capture", "reply").get()).toBeNull();
  });

  it("keeps the first terminal result across new capabilities and deletion", async () => {
    const { service, mutations } = await fixture();
    const operation = mutations.once("note", "capture", "reply");
    const winner = await operation.complete({
      operation: "create",
      entity: {
        entityType: "note",
        id: "new",
        content: "answer",
        metadata: {},
      },
    });
    expect(winner).toEqual({ operation: "create", entityId: "new" });
    expect(Object.isFrozen(winner)).toBe(true);
    await service.deleteEntity({ entityType: "note", id: "new" });
    const reopened = hostMutations(
      service,
      new Set(["note"]),
      "@fixture/notes",
    ).mutations.once("note", "capture", "reply");
    expect(await reopened.complete({ operation: "none" })).toEqual(winner);
    expect(
      await reopened.complete({
        operation: "create",
        entity: {
          entityType: "note",
          id: "other",
          content: "duplicate",
          metadata: {},
        },
      }),
    ).toEqual(winner);
    expect(
      await service.getEntity({ entityType: "note", id: "other" }),
    ).toBeNull();
  });

  it("a stale update neither consumes a receipt nor changes the entity", async () => {
    const { service, mutations } = await fixture();
    const edit = await mutations.read(
      { entityType: "note", id: "source" },
      baseEntityParserSchema,
    );
    if (!edit) throw new Error("Missing fixture");
    const operation = mutations.once("note", "capture", "reply");
    await service.updateEntity({
      entity: { ...edit.entity, metadata: { count: 9 } },
    });
    expect(
      await failed(
        operation.complete({
          operation: "update",
          edit,
          entity: { ...edit.entity, content: "stale" },
        }),
      ),
    ).toMatchObject({ code: "conflict" });
    expect(await operation.get()).toBeNull();
  });

  it("snapshots proposals before yielding and cannot forward native namespace/options", async () => {
    const { service, mutations, store } = await fixture();
    const gate = Promise.withResolvers<void>();
    const original = service.applyEntityMutationOnce.bind(service);
    spyOn(service, "applyEntityMutationOnce").mockImplementation(
      async (request) => {
        await gate.promise;
        return original(request);
      },
    );
    const entity = {
      entityType: "note",
      id: "new",
      content: "answer",
      metadata: { nested: { count: 1 } },
    };
    const proposal = Object.assign(
      { operation: "create" as const, entity },
      {
        receipt: { namespace: "victim", key: "reply" },
        options: { persistenceOrigin: "directory-sync" },
      },
    );
    const pending = mutations
      .once("note", "capture", "reply")
      .complete(proposal);
    entity.entityType = "foreign";
    entity.metadata.nested.count = 99;
    gate.resolve();
    expect(await pending).toEqual({ operation: "create", entityId: "new" });
    expect(
      (await service.getEntity({ entityType: "note", id: "new" }))?.metadata,
    ).toEqual({ nested: { count: 1 } });
    expect(
      await service.getEntityMutationReceipt({
        namespace: "victim",
        key: "reply",
      }),
    ).toBeNull();
    expect(store.exportIntents.size).toBeGreaterThan(0);
  });

  it("checks the snapshotted proposal type, not an earlier getter result", async () => {
    const { mutations, service } = await fixture();
    let calls = 0;
    const proposal = {
      operation: "create" as const,
      get entity(): {
        entityType: string;
        id: string;
        content: string;
        metadata: Record<string, never>;
      } {
        calls++;
        return {
          entityType: calls === 1 ? "foreign" : "note",
          id: "intrusion",
          content: "x",
          metadata: {},
        };
      },
    };
    expect(
      await failed(
        mutations.once("note", "capture", "reply").complete(proposal),
      ),
    ).toMatchObject({ code: "permission_denied" });
    expect(calls).toBe(1);
    expect(
      await service.getEntity({ entityType: "foreign", id: "intrusion" }),
    ).toBeNull();
  });

  it("validates operation addresses before looking up receipts", async () => {
    const { mutations } = await fixture();
    expect(() => mutations.once("note", "", "reply")).toThrow();
    expect(() => mutations.once("note", "capture", "x".repeat(501))).toThrow();
    const schema = z.object({ code: z.literal("permission_denied") });
    try {
      mutations.once("foreign", "capture", "reply");
      throw new Error("Expected refusal");
    } catch (error) {
      expect(schema.safeParse(error).success).toBe(true);
    }
  });
});
