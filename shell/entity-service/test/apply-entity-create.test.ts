import { describe, expect, test } from "bun:test";
import type {
  BaseEntity,
  CreateEntityRequest,
  EntityMutationResult,
} from "../src/types";
import {
  applyEntityCreate,
  type EntityCreateServices,
} from "../src/apply-entity-create";

/** The entity a caller has assembled and wants stored. */
function draft(overrides: Partial<BaseEntity> = {}): Omit<BaseEntity, "id"> & {
  id?: string;
} {
  return {
    entityType: "note",
    content: "A new note",
    contentHash: "hash-1",
    metadata: { title: "A note" },
    visibility: "public",
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function store(registered = true): {
  services: EntityCreateServices;
  created: CreateEntityRequest<BaseEntity>[];
} {
  const created: CreateEntityRequest<BaseEntity>[] = [];
  return {
    created,
    services: {
      entities: {
        createEntity: async (
          request: CreateEntityRequest<BaseEntity>,
        ): Promise<EntityMutationResult> => {
          created.push(request);
          return { entityId: "note-1", jobId: "job-1", skipped: false };
        },
      },
      registry: { isRegistered: () => registered },
      assertAllowed: (entityType, _action, permission): void => {
        if (permission === "public") {
          throw new Error(`Public callers may not create ${entityType}`);
        }
      },
    },
  };
}

/**
 * Storing an entity somebody assembled. Deliberately narrower than the system
 * create tool, which is mostly affordances for an agent — choosing a source,
 * preserving an upload, running a type's create interceptor. A console has
 * already assembled the entity; what it shares with the tool is the three
 * guards and the write.
 */
describe("creating an entity on somebody's behalf", () => {
  test("stores the entity the caller assembled", async () => {
    const holder = store();

    const outcome = await applyEntityCreate(
      holder.services,
      { entityType: "note", entity: draft() },
      { permission: "admin" },
    );

    expect(outcome).toMatchObject({ kind: "created", entityId: "note-1" });
    expect(holder.created[0]?.entity).toMatchObject({
      entityType: "note",
      content: "A new note",
    });
  });

  /**
   * No id: the entity service derives one, which keeps id policy on the
   * server rather than in whichever console assembled the draft.
   */
  test("leaves the id to the service when the caller names none", async () => {
    const holder = store();

    await applyEntityCreate(
      holder.services,
      { entityType: "note", entity: draft() },
      { permission: "admin" },
    );

    expect(holder.created[0]?.entity).not.toHaveProperty("id");
  });

  test("refuses a type nobody registered", async () => {
    const holder = store(false);

    const outcome = await applyEntityCreate(
      holder.services,
      { entityType: "ghost", entity: draft({ entityType: "ghost" }) },
      { permission: "admin" },
    );

    expect(outcome).toMatchObject({ kind: "denied", reason: "unknown-type" });
    expect(holder.created).toEqual([]);
  });

  test("refuses when the policy refuses", async () => {
    const holder = store();

    const outcome = await applyEntityCreate(
      holder.services,
      { entityType: "note", entity: draft() },
      { permission: "public" },
    );

    expect(outcome).toMatchObject({
      kind: "denied",
      reason: "entity-action-policy",
    });
    expect(holder.created).toEqual([]);
  });

  test("refuses a visibility the caller may not write", async () => {
    const holder = store();

    const outcome = await applyEntityCreate(
      holder.services,
      { entityType: "note", entity: draft({ visibility: "restricted" }) },
      { permission: "trusted" },
    );

    expect(outcome).toMatchObject({
      kind: "denied",
      reason: "visibility-policy",
    });
    expect(holder.created).toEqual([]);
  });

  test("carries the event context through to the write", async () => {
    const holder = store();

    await applyEntityCreate(
      holder.services,
      {
        entityType: "note",
        entity: draft(),
        eventContext: { interfaceType: "studio" },
      },
      { permission: "admin" },
    );

    expect(holder.created[0]?.options).toMatchObject({
      eventContext: { interfaceType: "studio" },
    });
  });
});
