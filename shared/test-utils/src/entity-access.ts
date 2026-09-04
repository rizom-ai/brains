import type {
  BaseEntity,
  ContentVisibility,
  EntityInput,
  EntityMutationResult,
  EntitySchema,
  IEntityService,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/plugins";
import type { JobEntityAccess } from "@brains/plugins";

/**
 * The entity access a job handler sees, backed by a real entity service.
 *
 * Six tests hand-built this, differing only in whether writes were allowed
 * and what they threw — so every field added to `JobEntityAccess` broke six
 * packages that only wanted reads.
 */
export function createTestEntityAccess(options: {
  readonly entityService: IEntityService;
  /**
   * Thrown on any write. A generation returns content and the runtime
   * persists it, so a generation that writes its own entity is a defect the
   * test should catch rather than a case it should support. Omitted, writes
   * go through to the service.
   */
  readonly refuseWrites?: string;
  /** Called before each write, for a test counting attempts. */
  readonly onWrite?: () => void;
}): JobEntityAccess {
  const service = options.entityService;
  const refusal = options.refuseWrites;
  const refuse = (): never => {
    throw new Error(refusal ?? "This job must not write entities");
  };
  // The reads carry the contract's overload pair, so the schema-bearing form
  // parses rather than asserts and the widened form promises only BaseEntity.
  async function listEntities(request: {
    entityType: string;
    options?: ListOptions;
  }): Promise<BaseEntity[]>;
  async function listEntities<T extends BaseEntity>(
    request: { entityType: string; options?: ListOptions },
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  async function listEntities<T extends BaseEntity>(
    request: { entityType: string; options?: ListOptions },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity[] | T[]> {
    return schema
      ? service.listEntities(request, schema)
      : service.listEntities(request);
  }

  async function getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: ContentVisibility | undefined;
  }): Promise<BaseEntity | null>;
  async function getEntity<T extends BaseEntity>(
    request: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    },
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function getEntity<T extends BaseEntity>(
    {
      entityType,
      id,
      visibilityScope,
    }: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const request = {
      entityType,
      id,
      ...(visibilityScope !== undefined ? { visibilityScope } : {}),
    };
    return schema
      ? service.getEntity(request, schema)
      : service.getEntity(request);
  }

  async function find(
    entityType: string,
    identifier: string,
  ): Promise<BaseEntity | null>;
  async function find<T extends BaseEntity>(
    entityType: string,
    identifier: string,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function find<T extends BaseEntity>(
    entityType: string,
    identifier: string,
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const found =
      (await service.getEntity({ entityType, id: identifier })) ??
      (
        await service.listEntities({
          entityType,
          options: { limit: 1, filter: { metadata: { title: identifier } } },
        })
      )[0] ??
      null;
    if (!found) return null;
    return schema ? schema.parse(found) : found;
  }

  async function search(request: {
    query: string;
    options?: SearchOptions;
  }): Promise<SearchResult<BaseEntity>[]>;
  async function search<T extends BaseEntity>(
    request: { query: string; options?: SearchOptions },
    schema: EntitySchema<T>,
  ): Promise<SearchResult<T>[]>;
  async function search<T extends BaseEntity>(
    request: { query: string; options?: SearchOptions },
    schema?: EntitySchema<T>,
  ): Promise<SearchResult<BaseEntity>[] | SearchResult<T>[]> {
    const results = await service.search(request);
    return schema
      ? results.map((result) => ({
          ...result,
          entity: schema.parse(result.entity),
        }))
      : results;
  }

  return {
    listEntities,
    getEntityCounts: (visibilityScope) =>
      service.getEntityCounts(visibilityScope),
    getEntity,
    find,
    getEntityTypes: () => service.getEntityTypes(),
    search,
    get: async () => null,
    create: <T extends BaseEntity>(
      entity: EntityInput<T>,
    ): Promise<EntityMutationResult> => {
      options.onWrite?.();
      return refusal === undefined
        ? service.createEntity({ entity })
        : refuse();
    },
    delete: async (entityType: string, id: string): Promise<boolean> => {
      options.onWrite?.();
      if (refusal !== undefined) refuse();
      return service.deleteEntity({ entityType, id });
    },
    update: <T extends BaseEntity>(
      entity: T,
    ): Promise<EntityMutationResult> => {
      options.onWrite?.();
      return refusal === undefined
        ? service.updateEntity({ entity })
        : refuse();
    },
    createPending: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ): Promise<{ entityId: string; created: boolean }> => {
      options.onWrite?.();
      if (refusal !== undefined) refuse();
      const written = await service.createEntity({ entity });
      return { entityId: written.entityId, created: true };
    },
    saveProcessed: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ): Promise<EntityMutationResult> => {
      options.onWrite?.();
      if (refusal !== undefined) refuse();
      // Create-or-update is an upsert, so this is one rather than a
      // read-then-branch that only looks like one. The fields the runtime
      // fills in are filled in here, because `upsertEntity` takes a whole
      // entity and `saveProcessed` is handed the half a caller knows.
      const now = new Date().toISOString();
      return service.upsertEntity({
        entity: {
          created: now,
          updated: now,
          visibility: "public",
          contentHash: `hash-${entity.id}`,
          ...entity,
        } satisfies BaseEntity,
      });
    },
  };
}
