import type {
  BaseEntity,
  ContentVisibility,
  EntityInput,
  EntityMutationResult,
  EntitySchema,
  EntityServiceClient,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/entity-service";
import { findEntityByIdentifier } from "@brains/entity-service";
import type { JobEntityAccess } from "./job-context-contract";
import { parseDefinitionEntity } from "../entity/entity-schema";
import {
  createPendingEntity,
  saveProcessedEntity,
} from "../entity/pending-ingestion";
import type { EntityDefinitionShape, EntityOf } from "../entity/entity-shape";

/**
 * Build the entity access a job handler sees.
 *
 * `ownedTypes` is the set of entity types the declaring package registered.
 * Reads ignore it; writes are refused outside it, so a package cannot write
 * another package's entities even though it can read them.
 */
export function createJobEntityAccess(
  entityService: EntityServiceClient,
  ownedTypes: ReadonlySet<string>,
  ownerLabel: string,
  /**
   * Caps what reads may see. Supplied when the work is done on someone's
   * behalf — grounding an answer for a public channel must not surface
   * restricted memory — and omitted for a job acting for the brain itself.
   */
  visibilityScope?: ContentVisibility,
): JobEntityAccess {
  const scoped = <T extends object>(request: T): T =>
    visibilityScope === undefined ? request : { ...request, visibilityScope };
  const assertOwned = (entityType: string): void => {
    if (!ownedTypes.has(entityType)) {
      throw new Error(
        `"${ownerLabel}" may only write entity types it declares, and "${entityType}" is not one of them`,
      );
    }
  };

  // Each read is declared as the same overload pair the contract carries, so
  // the schema-bearing form hands the schema straight to the entity service
  // and the widened form asks for nothing it cannot prove.
  async function listEntitiesScoped(request: {
    entityType: string;
    options?: ListOptions;
  }): Promise<BaseEntity[]>;
  async function listEntitiesScoped<T extends BaseEntity>(
    request: { entityType: string; options?: ListOptions },
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  async function listEntitiesScoped<T extends BaseEntity>(
    request: { entityType: string; options?: ListOptions },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity[] | T[]> {
    const scopedRequest = {
      ...request,
      ...(visibilityScope === undefined
        ? {}
        : {
            options: {
              ...request.options,
              filter: { ...request.options?.filter, visibilityScope },
            },
          }),
    };
    return schema
      ? entityService.listEntities(scopedRequest, schema)
      : entityService.listEntities(scopedRequest);
  }

  async function getEntityScoped(request: {
    entityType: string;
    id: string;
    visibilityScope?: ContentVisibility | undefined;
  }): Promise<BaseEntity | null>;
  async function getEntityScoped<T extends BaseEntity>(
    request: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    },
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function getEntityScoped<T extends BaseEntity>(
    {
      entityType,
      id,
      visibilityScope: requested,
    }: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const request = scoped({
      entityType,
      id,
      ...(requested !== undefined ? { visibilityScope: requested } : {}),
    });
    return schema
      ? entityService.getEntity(request, schema)
      : entityService.getEntity(request);
  }

  async function findScoped(
    entityType: string,
    identifier: string,
  ): Promise<BaseEntity | null>;
  async function findScoped<T extends BaseEntity>(
    entityType: string,
    identifier: string,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function findScoped<T extends BaseEntity>(
    entityType: string,
    identifier: string,
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const found = await findEntityByIdentifier(
      entityService,
      entityType,
      identifier,
    );
    if (!found) return null;
    return schema ? schema.parse(found) : found;
  }

  async function searchScoped(request: {
    query: string;
    options?: SearchOptions;
  }): Promise<SearchResult<BaseEntity>[]>;
  async function searchScoped<T extends BaseEntity>(
    request: { query: string; options?: SearchOptions },
    schema: EntitySchema<T>,
  ): Promise<SearchResult<T>[]>;
  async function searchScoped<T extends BaseEntity>(
    request: { query: string; options?: SearchOptions },
    schema?: EntitySchema<T>,
  ): Promise<SearchResult<BaseEntity>[] | SearchResult<T>[]> {
    const results = await entityService.search(request);
    return schema
      ? results.map((result) => ({
          ...result,
          entity: schema.parse(result.entity),
        }))
      : results;
  }

  return {
    listEntities: listEntitiesScoped,
    getEntity: getEntityScoped,
    find: findScoped,
    getEntityTypes: (): string[] => entityService.getEntityTypes(),
    getEntityCounts: (
      requested?: ContentVisibility,
    ): Promise<Array<{ entityType: string; count: number }>> =>
      entityService.getEntityCounts(requested ?? visibilityScope),
    get: async <TDefinition extends EntityDefinitionShape>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> => {
      const entity = await entityService.getEntity({
        entityType: definition.type,
        id,
        visibilityScope: "restricted",
      });
      return entity ? parseDefinitionEntity(definition, entity) : null;
    },
    search: searchScoped,
    create: <T extends BaseEntity>(
      entity: EntityInput<T>,
    ): Promise<EntityMutationResult> => {
      assertOwned(entity.entityType);
      return entityService.createEntity({ entity });
    },
    delete: async (entityType: string, id: string): Promise<boolean> => {
      assertOwned(entityType);
      return entityService.deleteEntity({ entityType, id });
    },
    update: <T extends BaseEntity>(
      entity: T,
    ): Promise<EntityMutationResult> => {
      assertOwned(entity.entityType);
      return entityService.updateEntity({ entity });
    },
    createPending: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ): Promise<{ entityId: string; created: boolean }> => {
      assertOwned(entity.entityType);
      const result = await createPendingEntity({ entityService, entity });
      return { entityId: result.entityId, created: result.created };
    },
    saveProcessed: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
      options?: { readonly expectedContentHash?: string | undefined },
    ): Promise<EntityMutationResult> => {
      assertOwned(entity.entityType);
      const result = await saveProcessedEntity({
        entityService,
        entity,
        ...(options?.expectedContentHash === undefined
          ? {}
          : { expectedContentHash: options.expectedContentHash }),
      });
      return result.mutation;
    },
  };
}
