import type {
  ListEntitiesRequest,
  SearchResult,
  ServiceAI,
  ServiceConversations,
  ServiceEntityReads,
  ServiceEntityWrites,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type {
  BaseEntity,
  EntitySchema,
  GetEntityRequest,
} from "@brains/sdk/internal/entity-runtime";
import type { Logger } from "@brains/utils/logger";

type SearchRequest = Parameters<ServiceEntityReads["search"]>[0];

/**
 * The entity service conversation memory reads and writes through, as its
 * class did through context.entityService: a read parsed by the schema it
 * names, as the entity service parses one, and every write handed on as
 * written.
 */
export interface MemoryEntityService {
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
  createEntity: ServiceEntityWrites["createEntity"];
  updateEntity: ServiceEntityWrites["updateEntity"];
  deleteEntity: ServiceEntityWrites["deleteEntity"];
}

/**
 * What conversation memory's retrieval, channel pickup, widgets and evals
 * reach, as its class reached them through its context: its logger, the
 * entity service, the brain's conversations and template generation.
 */
export interface MemoryContext {
  readonly logger: Logger;
  readonly entityService: MemoryEntityService;
  readonly conversations: ServiceConversations;
  readonly ai: Pick<ServiceAI, "generate">;
}

/** The entity service a converted class read and wrote through, from its runtime. */
function memoryEntityServiceOf(
  runtime: Pick<ServiceRuntime, "entityReads" | "entityWrites">,
): MemoryEntityService {
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
    createEntity: (request) => entityWrites.createEntity(request),
    updateEntity: (request) => entityWrites.updateEntity(request),
    deleteEntity: (request) => entityWrites.deleteEntity(request),
  } satisfies MemoryEntityService);
}

/** Conversation memory's context over the package's runtime. */
export function memoryContextOf(runtime: ServiceRuntime): MemoryContext {
  return {
    logger: runtime.logger,
    entityService: memoryEntityServiceOf(runtime),
    conversations: runtime.conversations,
    ai: runtime.ai,
  };
}
