import type {
  BaseEntity,
  EntitySchema,
  GetEntityRequest,
  ListEntitiesRequest,
  SearchResult,
} from "@brains/entity-service";
import type {
  ServiceEntityReads,
  ServiceEntityWrites,
  ServiceRuntime,
} from "./service-runtime";

type SearchRequest = Parameters<ServiceEntityReads["search"]>[0];

/**
 * The entity service a first-party service converted from a class reads
 * and writes its records through, as its class did through
 * context.entityService: a read parsed by the schema it names, as the
 * entity service parses one, and every write handed on as written.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */
export interface ServiceClassEntityService {
  getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  search(request: SearchRequest): Promise<SearchResult<BaseEntity>[]>;
  search<T extends BaseEntity>(
    request: SearchRequest,
    schema: EntitySchema<T>,
  ): Promise<SearchResult<T>[]>;
  countEntities: ServiceEntityReads["countEntities"];
  createEntity: ServiceEntityWrites["createEntity"];
  updateEntity: ServiceEntityWrites["updateEntity"];
  upsertEntity: ServiceEntityWrites["upsertEntity"];
  deleteEntity: ServiceEntityWrites["deleteEntity"];
}

/** The entity service a converted class read and wrote through, from its runtime. */
export function classEntityServiceOf(
  runtime: Pick<ServiceRuntime, "entityReads" | "entityWrites">,
): ServiceClassEntityService {
  const { entityReads, entityWrites } = runtime;
  function getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  function getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function getEntity(
    request: GetEntityRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity | null> {
    const entity = await entityReads.getEntity(request);
    return entity && schema ? schema.parse(entity) : entity;
  }
  function listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  function listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  async function listEntities(
    request: ListEntitiesRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity[]> {
    const entities = await entityReads.listEntities(request);
    return schema ? entities.map((entity) => schema.parse(entity)) : entities;
  }
  function search(request: SearchRequest): Promise<SearchResult<BaseEntity>[]>;
  function search<T extends BaseEntity>(
    request: SearchRequest,
    schema: EntitySchema<T>,
  ): Promise<SearchResult<T>[]>;
  async function search(
    request: SearchRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<SearchResult<BaseEntity>[]> {
    const results = await entityReads.search(request);
    return schema
      ? results.map((result) => ({
          ...result,
          entity: schema.parse(result.entity),
        }))
      : results;
  }
  return Object.freeze({
    getEntity,
    listEntities,
    search,
    countEntities: (request) => entityReads.countEntities(request),
    createEntity: (request) => entityWrites.createEntity(request),
    updateEntity: (request) => entityWrites.updateEntity(request),
    upsertEntity: (request) => entityWrites.upsertEntity(request),
    deleteEntity: (request) => entityWrites.deleteEntity(request),
  } satisfies ServiceClassEntityService);
}
