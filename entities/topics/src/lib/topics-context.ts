import type {
  ClassRuntimeState,
  ServiceAI,
  ServiceEntityMutations,
  ServiceEntityReads,
  ServiceEntityWrites,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";

/** The entity service topics reads and writes through, as its class did. */
export type TopicsEntityService = Pick<
  ServiceEntityReads,
  | "listEntities"
  | "getEntity"
  | "getEntityTypes"
  | "getEntityTypeConfig"
  | "nearestToEntity"
  | "search"
  | "searchWithDistances"
> &
  Pick<ServiceEntityWrites, "createEntity" | "updateEntity" | "deleteEntity"> &
  Pick<ServiceEntityMutations, "releaseProjectionOwnership"> & {
    /** Whether a type is registered. */
    hasEntityType(entityType: string): boolean;
  };

/**
 * What topics extraction, merging and its evals reach, as the topics class
 * reached them through its context: the entity service, template
 * generation, its runtime state under the namespaces the class named, its
 * prompts and its jobs.
 */
export interface TopicsContext {
  readonly entityService: TopicsEntityService;
  readonly ai: Pick<ServiceAI, "generate">;
  readonly runtimeState: ClassRuntimeState;
  readonly prompts: ServiceRuntime["prompts"];
  readonly jobs: ServiceRuntime["jobs"];
}

/** The topics context over the package's runtime. */
export function topicsContextOf(runtime: ServiceRuntime): TopicsContext {
  const { entityReads, entityWrites, entityMutations } = runtime;
  return {
    entityService: {
      listEntities: (request) => entityReads.listEntities(request),
      getEntity: (request) => entityReads.getEntity(request),
      getEntityTypes: () => entityReads.getEntityTypes(),
      getEntityTypeConfig: (entityType) =>
        entityReads.getEntityTypeConfig(entityType),
      nearestToEntity: (request) => entityReads.nearestToEntity(request),
      search: (request) => entityReads.search(request),
      searchWithDistances: (request) =>
        entityReads.searchWithDistances(request),
      createEntity: (request) => entityWrites.createEntity(request),
      updateEntity: (request) => entityWrites.updateEntity(request),
      deleteEntity: (request) => entityWrites.deleteEntity(request),
      releaseProjectionOwnership: (request) =>
        entityMutations.releaseProjectionOwnership(request),
      hasEntityType: (entityType) =>
        entityReads.getEntityTypes().includes(entityType),
    },
    ai: runtime.ai,
    runtimeState: runtime.classRuntimeState,
    prompts: runtime.prompts,
    jobs: runtime.jobs,
  };
}
