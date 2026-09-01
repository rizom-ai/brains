import type {
  BaseEntity,
  ContentVisibility,
  EntityInput,
  EntityMutationResult,
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

  return {
    listEntities: <T extends BaseEntity>(request: {
      entityType: string;
      options?: ListOptions;
    }): Promise<T[]> =>
      entityService.listEntities<T>({
        ...request,
        ...(visibilityScope === undefined
          ? {}
          : {
              options: {
                ...request.options,
                filter: { ...request.options?.filter, visibilityScope },
              },
            }),
      }),
    getEntity: <T extends BaseEntity>({
      entityType,
      id,
      visibilityScope: requested,
    }: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    }): Promise<T | null> =>
      entityService.getEntity<T>(
        scoped({
          entityType,
          id,
          ...(requested !== undefined ? { visibilityScope: requested } : {}),
        }),
      ),
    find: async <T extends BaseEntity>(
      entityType: string,
      identifier: string,
    ): Promise<T | null> =>
      (await findEntityByIdentifier(
        entityService,
        entityType,
        identifier,
      )) as T | null,
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
    search: <T extends BaseEntity = BaseEntity>(request: {
      query: string;
      options?: SearchOptions;
    }): Promise<SearchResult<T>[]> => entityService.search<T>(request),
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
