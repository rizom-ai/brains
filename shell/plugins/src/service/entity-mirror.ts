import {
  createEntityBulkCoordination,
  type AcknowledgeEntityExportsRequest,
  type BaseEntity,
  type BulkMutationInput,
  type CreateEntityRequest,
  type DeleteEntityRequest,
  type EntityBulkCoordination,
  type EntityExportIntent,
  type EntityMutationResult,
  type EntitySchema,
  type EntityServiceClient,
  type GetEntityRequest,
  type ListEntitiesRequest,
  type UpsertEntityRequest,
} from "@brains/entity-service";
import type { IShell } from "../interfaces";

/**
 * The reads and writes a filesystem mirror makes, across every type.
 *
 * Written out rather than picked from the entity service: a `Pick` makes the
 * public contract whatever the internal service happens to say, so widening a
 * method there widens this silently, and the internal type is emitted into the
 * public declarations alongside it. Declared members also keep their
 * overloads, which a mapped type collapses. The runtime still delegates every
 * call to the service, and the compiler checks that the delegation satisfies
 * each signature below.
 */
export interface EntityMirrorClient {
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
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;
  createEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
  ): Promise<EntityMutationResult>;
  upsertEntity<T extends BaseEntity>(
    request: UpsertEntityRequest<T>,
  ): Promise<EntityMutationResult & { created: boolean }>;
  deleteEntity(request: DeleteEntityRequest): Promise<boolean>;
  runBulkMutation<TResult>(
    input: BulkMutationInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult>;
  serializeEntity(entity: BaseEntity): string;
  deserializeEntity(markdown: string, entityType: string): Partial<BaseEntity>;
  listPendingEntityExports(): Promise<EntityExportIntent[]>;
  hasPendingEntityExports(): Promise<boolean>;
  acknowledgeEntityExports(
    request: AcknowledgeEntityExportsRequest,
  ): Promise<number>;
  getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null>;
}

/**
 * The brain's records as a mirror keeps them.
 *
 * A package's own writes are scoped to the types it declares, and a mirror
 * declares none and writes every one: an import parses a file through the
 * type's own adapter and stores what it says, an export serialises whatever
 * changed. It is the third admitted cross-type write path after
 * `createRouted` (a type's own route) and `operatorEntities` (a person,
 * policy-checked): here the file is the record and the check is the content
 * hash, not a permission. With the records come the durable export ledger
 * the mirror drains and the bulk coordination its sweeps run under.
 *
 * Named consumer: @brains/directory-sync.
 */
export interface EntityMirror extends EntityMirrorClient {
  readonly coordination: EntityBulkCoordination;
}

export function createEntityMirror(
  shell: IShell,
  options: {
    /** The declaring plugin, which is what a bulk mutation says began it. */
    readonly pluginId: string;
  },
): EntityMirror {
  // Every call reaches the shell's entity service at the moment it is made,
  // the way the class context did: what the service answers is what the
  // mirror answers, including anything installed on it after setup.
  const entities = (): EntityServiceClient => shell.getEntityService();

  function getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  function getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  function getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    return schema
      ? entities().getEntity(request, schema)
      : entities().getEntity(request);
  }

  function listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  function listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  function listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity[] | T[]> {
    return schema
      ? entities().listEntities(request, schema)
      : entities().listEntities(request);
  }

  return {
    getEntity,
    listEntities,
    getEntityTypes: () => entities().getEntityTypes(),
    hasEntityType: (type) => entities().hasEntityType(type),
    createEntity: (request) => entities().createEntity(request),
    upsertEntity: (request) => entities().upsertEntity(request),
    deleteEntity: (request) => entities().deleteEntity(request),
    runBulkMutation: (input, mutation) =>
      entities().runBulkMutation(input, mutation),
    serializeEntity: (entity) => entities().serializeEntity(entity),
    deserializeEntity: (markdown, entityType) =>
      entities().deserializeEntity(markdown, entityType),
    listPendingEntityExports: () => entities().listPendingEntityExports(),
    hasPendingEntityExports: () => entities().hasPendingEntityExports(),
    acknowledgeEntityExports: (request) =>
      entities().acknowledgeEntityExports(request),
    getAsyncJobStatus: (jobId) => entities().getAsyncJobStatus(jobId),
    coordination: createEntityBulkCoordination(
      shell.getEntityService(),
      options.pluginId,
    ),
  };
}
