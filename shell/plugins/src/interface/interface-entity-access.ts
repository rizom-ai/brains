import type {
  BaseEntity,
  ContentVisibility,
  EntitySchema,
  ICoreEntityService,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/entity-service";
import type { JobEntityAccess } from "../job/job-context-contract";
import { parseDefinitionEntity } from "../entity/entity-schema";
import type { EntityDefinitionShape, EntityOf } from "../entity/entity-shape";

/**
 * The entity access an interface's own tools get: reads, and nothing else.
 *
 * An interface declares no entity types, so there is no set for a write to
 * be checked against — every write is a trespass by construction. The
 * methods are still here because the tool contract is shared with services,
 * and refusing loudly is better than a surface that silently lacks them.
 *
 * The reads go through the core service the interface context already
 * carries, which is read-only for the same reason.
 */
export function createInterfaceEntityAccess(
  entityService: ICoreEntityService,
  interfaceId: string,
): JobEntityAccess {
  const refuse = (): never => {
    throw new Error(
      `Interface "${interfaceId}" declares no entity types, so it cannot write one`,
    );
  };

  // Declared as the contract's overload pairs so the schema-bearing form
  // parses what comes back rather than asserting a caller-chosen type.
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
      ? entityService.listEntities(request, schema)
      : entityService.listEntities(request);
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
    request: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const scoped = {
      entityType: request.entityType,
      id: request.id,
      ...(request.visibilityScope === undefined
        ? {}
        : { visibilityScope: request.visibilityScope }),
    };
    return schema
      ? entityService.getEntity(scoped, schema)
      : entityService.getEntity(scoped);
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
    const found = await entityService.getEntity({
      entityType,
      id: identifier,
    });
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
    const results = await entityService.search(request);
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
      entityService.getEntityCounts(visibilityScope),
    getEntity,
    find,
    getEntityTypes: () => entityService.getEntityTypes(),
    search,
    get: async <TDefinition extends EntityDefinitionShape>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> => {
      const entity = await entityService.getEntity({
        entityType: definition.type,
        id,
      });
      return entity ? parseDefinitionEntity(definition, entity) : null;
    },
    create: refuse,
    update: refuse,
    delete: refuse,
    createPending: refuse,
    saveProcessed: refuse,
  };
}
