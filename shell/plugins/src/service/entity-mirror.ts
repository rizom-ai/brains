import type {
  DurableBulkMutationCoordinator,
  EntityServiceClient,
} from "@brains/entity-service";
import type { ServicePluginContext } from "./context";

/**
 * The reads and writes a filesystem mirror makes across every type, as
 * directory-sync's class made them through context.entityService: records
 * read as stored and placed by their type's config, written as the file says, serialized and parsed by
 * their type's own adapter, and the durable export ledger it drains.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */
export type ServiceEntityMirrorClient = Pick<
  EntityServiceClient,
  | "getEntityTypes"
  | "hasEntityType"
  | "getEntityTypeConfig"
  | "listEntities"
  | "getEntityRaw"
  | "getEntityWriteSnapshot"
  | "createEntity"
  | "upsertEntity"
  | "deleteEntity"
  | "runBulkMutation"
  | "serializeEntity"
  | "deserializeEntity"
  | "listPendingEntityExports"
  | "hasPendingEntityExports"
  | "acknowledgeEntityExports"
  | "getAsyncJobStatus"
>;

/**
 * The brain's records as a mirror keeps them, with the bulk coordination its
 * sweeps run under, as the class read context.bulkMutations. A package's
 * declared writes are scoped to its own types; a mirror declares none and
 * writes every one, the file being the record and the content hash the
 * check. Named consumer: @brains/directory-sync.
 */
export interface ServiceEntityMirror extends ServiceEntityMirrorClient {
  readonly coordination: DurableBulkMutationCoordinator;
}

/** The mirror a class's context reached, each method bound on its own. */
export function entityMirrorOf(
  context: ServicePluginContext,
): ServiceEntityMirror {
  const { entityService } = context;
  return Object.freeze({
    getEntityTypes: entityService.getEntityTypes.bind(entityService),
    hasEntityType: entityService.hasEntityType.bind(entityService),
    getEntityTypeConfig: entityService.getEntityTypeConfig.bind(entityService),
    listEntities: entityService.listEntities.bind(entityService),
    getEntityRaw: entityService.getEntityRaw.bind(entityService),
    getEntityWriteSnapshot:
      entityService.getEntityWriteSnapshot.bind(entityService),
    createEntity: entityService.createEntity.bind(entityService),
    upsertEntity: entityService.upsertEntity.bind(entityService),
    deleteEntity: entityService.deleteEntity.bind(entityService),
    runBulkMutation: entityService.runBulkMutation.bind(entityService),
    serializeEntity: entityService.serializeEntity.bind(entityService),
    deserializeEntity: entityService.deserializeEntity.bind(entityService),
    listPendingEntityExports:
      entityService.listPendingEntityExports.bind(entityService),
    hasPendingEntityExports:
      entityService.hasPendingEntityExports.bind(entityService),
    acknowledgeEntityExports:
      entityService.acknowledgeEntityExports.bind(entityService),
    getAsyncJobStatus: entityService.getAsyncJobStatus.bind(entityService),
    coordination: context.bulkMutations,
  } satisfies ServiceEntityMirror);
}
