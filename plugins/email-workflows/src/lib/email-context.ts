import type {
  BaseEntity,
  EntitySchema,
  GetEntityRequest,
  ListEntitiesRequest,
} from "@brains/plugins";
import type {
  ServiceEntityReads,
  ServiceEntityWrites,
  ServicePermissions,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";

/**
 * The entity service email-workflows reads and writes mail items and reply
 * drafts through, as its class did through its context: a read parsed by
 * the schema it names, as the entity service parses one.
 */
export interface EmailEntityService {
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
  countEntities: ServiceEntityReads["countEntities"];
  createEntity: ServiceEntityWrites["createEntity"];
  updateEntity: ServiceEntityWrites["updateEntity"];
}

/** What email-workflows checks and reads through, as its class did. */
export interface EmailContext {
  readonly entityService: EmailEntityService;
  readonly permissions: ServicePermissions;
  readonly channels: {
    getDeliveryProvider: ServiceRuntime["deliveryProvider"];
  };
}

/** The entity service email-workflows reads and writes through, from the runtime. */
export function emailEntityServiceOf(
  runtime: Pick<ServiceRuntime, "entityReads" | "entityWrites">,
): EmailEntityService {
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
  return {
    getEntity,
    listEntities,
    countEntities: (request) => entityReads.countEntities(request),
    createEntity: (request) => entityWrites.createEntity(request),
    updateEntity: (request) => entityWrites.updateEntity(request),
  };
}

/** What email-workflows checks and reads through, from the runtime. */
export function emailContextOf(runtime: ServiceRuntime): EmailContext {
  return {
    entityService: emailEntityServiceOf(runtime),
    permissions: runtime.permissions,
    channels: { getDeliveryProvider: runtime.deliveryProvider },
  };
}
