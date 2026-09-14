import {
  EntityService,
  EntityBinaryClient,
  EntityFileRuntime,
  ENTITY_BINARY_CONTROL_SERVICE,
  ENTITY_PUBLICATION_SERVICE,
  type EntityServiceClient,
  type EntityFileActorOptions,
  type ProjectionBatchScope,
} from "@brains/entity-service";
import { LocalDatabaseRpcClient } from "../local-database-endpoint";
import type { LocalDatabaseEndpointConfig } from "../runtime-process-role";
import type { ShellLifecycle } from "./shell-lifecycle";
import type { OperationScope } from "@brains/operation-context";

/** Provision one bounded actor owner per shell. Combined mode uses its own
 * authenticated loopback connection, never another database opener.
 */
export function provisionEntityFiles(
  service: EntityServiceClient,
  actors: EntityFileActorOptions,
  endpoint: LocalDatabaseEndpointConfig | undefined,
  lifecycle: ShellLifecycle,
  getOperationScope: () => OperationScope | undefined,
): void {
  if (service.fileAssets)
    throw new Error("Entity file runtime is already provisioned");
  let control = service.assetTransfers;
  let owned: LocalDatabaseRpcClient | undefined;
  if (!control) {
    if (
      !(service instanceof EntityService) ||
      !service.getBinaryPersistence() ||
      !endpoint
    )
      throw new Error(
        "File actors require owner binary authority and an authenticated endpoint",
      );
    const client = new LocalDatabaseRpcClient({
      config: { ...endpoint, sessionId: `${endpoint.sessionId}:files` },
      getOperationScope,
    });
    owned = client;
    control = new EntityBinaryClient({
      transport: {
        invalidate: (): void => client.close(),
        control: (input, options): Promise<unknown> =>
          client.request(ENTITY_BINARY_CONTROL_SERVICE, input, options),
        publication: (input, options): Promise<unknown> =>
          client.request(ENTITY_PUBLICATION_SERVICE, input, options),
      },
      getBatchScope: (): ProjectionBatchScope | undefined =>
        service.getProjectionStore().currentBatchScope(),
    });
  }
  const runtime = new EntityFileRuntime(
    control,
    actors,
    owned ? (): void => owned.close() : undefined,
  );
  service.fileAssets = runtime;
  lifecycle.addFinalizer(() => runtime.close()); // Also covers failed boot.
}
