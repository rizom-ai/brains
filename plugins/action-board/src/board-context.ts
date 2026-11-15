import type {
  ServiceEntityReads,
  ServiceEntityWrites,
  ServiceGroupingReads,
  ServiceRuntime,
  ServiceStudio,
} from "@brains/sdk/internal/service-runtime";
import type {
  BaseEntity,
  EntitySchema,
  GetEntityRequest,
} from "@brains/sdk/internal/entity-runtime";

type ListEntitiesRequest = Parameters<ServiceEntityReads["listEntities"]>[0];

/**
 * The entity service the board reads and writes cards through, as its class
 * did through context.entityService: a read parsed by the schema it names,
 * as the entity service parses one, and every write handed on as written.
 */
export interface BoardEntityService {
  getEntityTypes(): string[];
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
  createEntity: ServiceEntityWrites["createEntity"];
  updateEntity: ServiceEntityWrites["updateEntity"];
  deleteEntity: ServiceEntityWrites["deleteEntity"];
}

/** What the board, its Inbox source and its tools reach. */
export interface BoardContext {
  readonly entityService: BoardEntityService;
  readonly groupings: ServiceGroupingReads;
  readonly studio: ServiceStudio;
}

/** The board's context over the package's runtime. */
export function boardContextOf(runtime: ServiceRuntime): BoardContext {
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
  const groupings = runtime.groupingReads;
  return Object.freeze({
    entityService: Object.freeze({
      getEntityTypes: () => entityReads.getEntityTypes(),
      getEntity,
      listEntities,
      createEntity: (request) => entityWrites.createEntity(request),
      updateEntity: (request) => entityWrites.updateEntity(request),
      deleteEntity: (request) => entityWrites.deleteEntity(request),
    } satisfies BoardEntityService),
    groupings,
    studio: runtime.studio,
  });
}
