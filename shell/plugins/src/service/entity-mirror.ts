import {
  createEntityBulkCoordination,
  type EntityBulkCoordination,
  type EntityServiceClient,
} from "@brains/entity-service";
import type { IShell } from "../interfaces";

/** The reads and writes a filesystem mirror makes, across every type. */
export type EntityMirrorClient = Pick<
  EntityServiceClient,
  | "listEntities"
  | "getEntity"
  | "getEntityTypes"
  | "hasEntityType"
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
  const entities = shell.getEntityService();
  return {
    listEntities: entities.listEntities.bind(entities),
    getEntity: entities.getEntity.bind(entities),
    getEntityTypes: entities.getEntityTypes.bind(entities),
    hasEntityType: entities.hasEntityType.bind(entities),
    createEntity: entities.createEntity.bind(entities),
    upsertEntity: entities.upsertEntity.bind(entities),
    deleteEntity: entities.deleteEntity.bind(entities),
    runBulkMutation: entities.runBulkMutation.bind(entities),
    serializeEntity: entities.serializeEntity.bind(entities),
    deserializeEntity: entities.deserializeEntity.bind(entities),
    listPendingEntityExports: entities.listPendingEntityExports.bind(entities),
    hasPendingEntityExports: entities.hasPendingEntityExports.bind(entities),
    acknowledgeEntityExports: entities.acknowledgeEntityExports.bind(entities),
    getAsyncJobStatus: entities.getAsyncJobStatus.bind(entities),
    coordination: createEntityBulkCoordination(entities, options.pluginId),
  };
}
