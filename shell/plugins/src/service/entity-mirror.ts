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

/**
 * The mirror a class's context reached. Each method is looked up on the
 * entity service when it is called, as the class called through
 * context.entityService, so what the service answers then is what the
 * mirror answers.
 */
export function entityMirrorOf(
  context: ServicePluginContext,
): ServiceEntityMirror {
  const { entityService } = context;
  return Object.freeze({
    get getEntityTypes(): ServiceEntityMirrorClient["getEntityTypes"] {
      return entityService.getEntityTypes.bind(entityService);
    },
    get hasEntityType(): ServiceEntityMirrorClient["hasEntityType"] {
      return entityService.hasEntityType.bind(entityService);
    },
    get getEntityTypeConfig(): ServiceEntityMirrorClient["getEntityTypeConfig"] {
      return entityService.getEntityTypeConfig.bind(entityService);
    },
    get listEntities(): ServiceEntityMirrorClient["listEntities"] {
      return entityService.listEntities.bind(entityService);
    },
    get getEntityRaw(): ServiceEntityMirrorClient["getEntityRaw"] {
      return entityService.getEntityRaw.bind(entityService);
    },
    get getEntityWriteSnapshot(): ServiceEntityMirrorClient["getEntityWriteSnapshot"] {
      return entityService.getEntityWriteSnapshot.bind(entityService);
    },
    get createEntity(): ServiceEntityMirrorClient["createEntity"] {
      return entityService.createEntity.bind(entityService);
    },
    get upsertEntity(): ServiceEntityMirrorClient["upsertEntity"] {
      return entityService.upsertEntity.bind(entityService);
    },
    get deleteEntity(): ServiceEntityMirrorClient["deleteEntity"] {
      return entityService.deleteEntity.bind(entityService);
    },
    get runBulkMutation(): ServiceEntityMirrorClient["runBulkMutation"] {
      return entityService.runBulkMutation.bind(entityService);
    },
    get serializeEntity(): ServiceEntityMirrorClient["serializeEntity"] {
      return entityService.serializeEntity.bind(entityService);
    },
    get deserializeEntity(): ServiceEntityMirrorClient["deserializeEntity"] {
      return entityService.deserializeEntity.bind(entityService);
    },
    get listPendingEntityExports(): ServiceEntityMirrorClient["listPendingEntityExports"] {
      return entityService.listPendingEntityExports.bind(entityService);
    },
    get hasPendingEntityExports(): ServiceEntityMirrorClient["hasPendingEntityExports"] {
      return entityService.hasPendingEntityExports.bind(entityService);
    },
    get acknowledgeEntityExports(): ServiceEntityMirrorClient["acknowledgeEntityExports"] {
      return entityService.acknowledgeEntityExports.bind(entityService);
    },
    get getAsyncJobStatus(): ServiceEntityMirrorClient["getAsyncJobStatus"] {
      return entityService.getAsyncJobStatus.bind(entityService);
    },
    coordination: context.bulkMutations,
  } satisfies ServiceEntityMirror);
}
