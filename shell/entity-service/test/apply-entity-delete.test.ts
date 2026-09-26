import { describe, expect, test } from "bun:test";
import type {
  BaseEntity,
  DeleteEntityRequest,
  GetEntityRequest,
} from "../src/types";
import {
  applyEntityDelete,
  type EntityDeleteServices,
} from "../src/apply-entity-delete";

function post(overrides: Partial<BaseEntity> = {}): BaseEntity {
  return {
    id: "post-1",
    entityType: "post",
    content: "Body",
    contentHash: "hash-1",
    metadata: { status: "draft" },
    visibility: "public",
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * One entity, held in memory, with what a delete asks of the store: read it
 * back at a scope, and remove it.
 */
function storeHolding(
  entity: BaseEntity | null,
  registered: { isSingleton?: boolean } | null = {},
): {
  services: EntityDeleteServices;
  deleted: DeleteEntityRequest[];
} {
  const deleted: DeleteEntityRequest[] = [];
  return {
    deleted,
    services: {
      entities: {
        getEntity: async ({
          visibilityScope,
        }: GetEntityRequest): Promise<BaseEntity | null> => {
          if (!entity) return null;
          if (
            entity.visibility === "restricted" &&
            visibilityScope !== "restricted"
          ) {
            return null;
          }
          return entity;
        },
        deleteEntity: async (
          request: DeleteEntityRequest,
        ): Promise<boolean> => {
          deleted.push(request);
          return true;
        },
      },
      registry: {
        isRegistered: () => registered !== null,
        isSingleton: () => registered?.isSingleton === true,
      },
      assertAllowed: (entityType, _action, permission): void => {
        if (permission !== "admin") {
          throw new Error(`Only admins may delete ${entityType}`);
        }
      },
    },
  };
}

/**
 * Removing one of somebody else's entities. The console and the system tool
 * both did this; only the tool refused a singleton, which is why a console
 * could delete the brain's identity record and a tool could not.
 */
describe("deleting an entity", () => {
  test("removes it, carrying the event context", async () => {
    const store = storeHolding(post());

    const outcome = await applyEntityDelete(
      store.services,
      {
        entityType: "post",
        id: "post-1",
        eventContext: { interfaceType: "studio" },
      },
      { permission: "admin" },
    );

    expect(outcome).toEqual({ kind: "deleted" });
    expect(store.deleted[0]).toMatchObject({
      entityType: "post",
      id: "post-1",
      options: { eventContext: { interfaceType: "studio" } },
    });
  });

  test("answers not-found when nothing is stored at the caller's scope", async () => {
    const store = storeHolding(post({ visibility: "restricted" }));

    const outcome = await applyEntityDelete(
      store.services,
      { entityType: "post", id: "post-1" },
      { permission: "public" },
    );

    expect(outcome).toEqual({ kind: "not-found" });
    expect(store.deleted).toEqual([]);
  });

  test("refuses a type nobody registered, rather than letting the registry throw", async () => {
    const store = storeHolding(post(), null);

    const outcome = await applyEntityDelete(
      store.services,
      { entityType: "ghost", id: "post-1" },
      { permission: "admin" },
    );

    expect(outcome).toMatchObject({ kind: "denied", reason: "unknown-type" });
    expect(store.deleted).toEqual([]);
  });

  /**
   * A singleton is the brain's one record of something — its identity, its
   * site settings. There is no second one to fall back to, so it is updated
   * rather than removed.
   */
  test("refuses a singleton, which is updated rather than removed", async () => {
    const store = storeHolding(post({ entityType: "anchor-profile" }), {
      isSingleton: true,
    });

    const outcome = await applyEntityDelete(
      store.services,
      { entityType: "anchor-profile", id: "post-1" },
      { permission: "admin" },
    );

    expect(outcome).toMatchObject({ kind: "denied", reason: "singleton" });
    expect(store.deleted).toEqual([]);
  });

  test("refuses when the policy refuses, and says which policy", async () => {
    const store = storeHolding(post());

    const outcome = await applyEntityDelete(
      store.services,
      { entityType: "post", id: "post-1" },
      { permission: "trusted" },
    );

    expect(outcome).toMatchObject({
      kind: "denied",
      reason: "entity-action-policy",
    });
    expect(store.deleted).toEqual([]);
  });
});
