import { describe, expect, test } from "bun:test";
import type {
  BaseEntity,
  EntityMutationResult,
  GetEntityRequest,
  UpdateEntityOptions,
  UpdateEntityRequest,
} from "../src/types";
import {
  applyEntityEdit,
  type EntityEditRequest,
  type EntityEditServices,
} from "../src/apply-entity-edit";

/**
 * One entity, held in memory, with the two operations an edit makes of the
 * store: read it back at a scope, and write it. Records what was written so
 * a test can say what the caller's edit became.
 */
function storeHolding(entity: BaseEntity | null): {
  services: EntityEditServices;
  written: BaseEntity[];
  options: Array<UpdateEntityOptions | undefined>;
  refused: string[];
} {
  const written: BaseEntity[] = [];
  const options: Array<UpdateEntityOptions | undefined> = [];
  const refused: string[] = [];
  return {
    written,
    options,
    refused,
    services: {
      entities: {
        getEntity: async ({
          visibilityScope,
        }: GetEntityRequest): Promise<BaseEntity | null> => {
          if (!entity) return null;
          // A restricted entity is invisible to a public read, as the real
          // store would have it.
          if (
            entity.visibility === "restricted" &&
            visibilityScope !== "restricted"
          ) {
            return null;
          }
          return entity;
        },
        updateEntity: async ({
          entity: next,
          options: writeOptions,
        }: UpdateEntityRequest<BaseEntity>): Promise<EntityMutationResult> => {
          written.push(next);
          options.push(writeOptions);
          return { entityId: next.id, jobId: "job-1", skipped: false };
        },
      },
      registry: {
        getEntityTypeConfig: () => ({
          publish: { publishStatuses: ["published"] },
        }),
      },
      assertAllowed: (entityType, action, permission): void => {
        if (permission === "public") {
          refused.push(`${action}:${entityType}`);
          throw new Error(`Public callers may not ${action} ${entityType}`);
        }
      },
    },
  };
}

function post(overrides: Partial<BaseEntity> = {}): BaseEntity {
  return {
    id: "post-1",
    entityType: "post",
    content: "Draft body",
    contentHash: "hash-1",
    metadata: { status: "draft", title: "A post" },
    visibility: "public",
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function edit(overrides: Partial<EntityEditRequest> = {}): EntityEditRequest {
  return {
    entityType: "post",
    id: "post-1",
    next: post({
      content: "Edited body",
      metadata: { status: "draft", title: "A post, edited" },
    }),
    ...overrides,
  };
}

/**
 * The five steps every editor of somebody else's type has to take, in one
 * place: read at the caller's scope, notice a concurrent write, decide
 * whether the change crosses the publish boundary, ask the policy, and check
 * the visibility being written. The studio editor and the system update tool
 * both did all five, separately.
 */
describe("applying an edit to an entity", () => {
  test("writes the entity the caller handed over, whole", async () => {
    const store = storeHolding(post());

    const outcome = await applyEntityEdit(store.services, edit(), {
      permission: "admin",
    });

    expect(outcome).toMatchObject({ kind: "updated", action: "update" });
    expect(store.written[0]).toMatchObject({
      id: "post-1",
      content: "Edited body",
      metadata: { status: "draft", title: "A post, edited" },
      visibility: "public",
    });
  });

  test("answers not-found when nothing is stored at the caller's scope", async () => {
    const store = storeHolding(post({ visibility: "restricted" }));

    const outcome = await applyEntityEdit(store.services, edit(), {
      permission: "public",
    });

    expect(outcome).toEqual({ kind: "not-found" });
    expect(store.written).toEqual([]);
  });

  /**
   * Another writer — an agent, or a git import — may have touched the
   * entity since it was opened. The caller says which version it reviewed;
   * a different one stored is a conflict, reported with the current hash so
   * the caller can reload rather than overwrite.
   */
  test("reports a conflict when the reviewed version is no longer current", async () => {
    const store = storeHolding(post({ contentHash: "hash-2" }));

    const outcome = await applyEntityEdit(
      store.services,
      edit({ baseContentHash: "hash-1" }),
      { permission: "admin" },
    );

    expect(outcome).toEqual({ kind: "conflict", currentContentHash: "hash-2" });
    expect(store.written).toEqual([]);
  });

  test("writes when the reviewed version is the current one", async () => {
    const store = storeHolding(post({ contentHash: "hash-1" }));

    const outcome = await applyEntityEdit(
      store.services,
      edit({ baseContentHash: "hash-1" }),
      { permission: "admin" },
    );

    expect(outcome).toMatchObject({ kind: "updated" });
  });

  test("asks the policy for publish when the status crosses the boundary", async () => {
    const store = storeHolding(post());

    const outcome = await applyEntityEdit(
      store.services,
      edit({
        next: post({ content: "Body", metadata: { status: "published" } }),
      }),
      { permission: "admin" },
    );

    expect(outcome).toMatchObject({ kind: "updated", action: "publish" });
  });

  test("refuses when the policy refuses, and says which policy", async () => {
    const store = storeHolding(post());

    const outcome = await applyEntityEdit(store.services, edit(), {
      permission: "public",
    });

    expect(outcome).toMatchObject({
      kind: "denied",
      reason: "entity-action-policy",
    });
    expect(store.refused).toEqual(["update:post"]);
    expect(store.written).toEqual([]);
  });

  test("refuses a visibility the caller may not write", async () => {
    const store = storeHolding(post());

    const outcome = await applyEntityEdit(
      store.services,
      edit({
        next: post({
          content: "Body",
          metadata: { status: "draft" },
          visibility: "restricted",
        }),
      }),
      { permission: "trusted" },
    );

    expect(outcome).toMatchObject({
      kind: "denied",
      reason: "visibility-policy",
    });
    expect(store.written).toEqual([]);
  });

  test("lets a caller move an entity to a visibility it may write", async () => {
    const store = storeHolding(post());

    const outcome = await applyEntityEdit(
      store.services,
      edit({
        next: post({
          content: "Body",
          metadata: { status: "draft" },
          visibility: "shared",
        }),
      }),
      { permission: "trusted" },
    );

    expect(outcome).toMatchObject({ kind: "updated" });
    expect(store.written[0]?.visibility).toBe("shared");
  });

  test("carries the event context through to the write", async () => {
    const store = storeHolding(post());

    await applyEntityEdit(
      store.services,
      edit({ eventContext: { interfaceType: "studio" } }),
      { permission: "admin" },
    );

    expect(store.options[0]).toEqual({
      eventContext: { interfaceType: "studio" },
    });
  });
});
