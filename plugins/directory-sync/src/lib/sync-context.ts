import type {
  DurableBulkMutationCoordinator,
  IRuntimeStateNamespace,
} from "@brains/plugins";
import type {
  ServiceClassJobs,
  ServiceEntityMirrorClient,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";

/**
 * What directory-sync reads, writes and queues through, as its class did
 * through its context: the brain's records as a mirror keeps them, the
 * bulk coordination its sweeps run under, its runtime state, its jobs and
 * the git broker's whereabouts.
 */
export interface DirectorySyncCore {
  readonly pluginId: string;
  readonly logger: Logger;
  readonly dataDir: string;
  readonly executionOnly: boolean;
  readonly gitBrokerSocket: string | undefined;
  readonly gitBrokerCheckout: string | undefined;
  readonly entityService: ServiceEntityMirrorClient;
  readonly bulkMutations: DurableBulkMutationCoordinator;
  readonly runtimeState: Pick<IRuntimeStateNamespace, "scoped">;
  readonly jobs: Pick<
    ServiceClassJobs,
    "enqueue" | "enqueueBatch" | "getBatchStatus" | "getStatus"
  >;
}

/** The core, and the bus, Studio, template and health it registers on. */
export interface DirectorySyncContext extends DirectorySyncCore {
  readonly runtime: Pick<
    ServiceRuntime,
    | "answer"
    | "listen"
    | "messaging"
    | "initialSync"
    | "studio"
    | "template"
    | "operationalHealth"
  >;
}

/** Directory-sync's context, from its service runtime. */
export function directorySyncContextOf(
  runtime: ServiceRuntime,
): DirectorySyncContext {
  return {
    pluginId: runtime.pluginId,
    logger: runtime.logger,
    dataDir: runtime.dataDir,
    executionOnly: runtime.executionOnly,
    gitBrokerSocket: runtime.gitBroker.socket,
    gitBrokerCheckout: runtime.gitBroker.checkout,
    entityService: runtime.entityMirror,
    bulkMutations: runtime.entityMirror.coordination,
    runtimeState: runtime.classRuntimeState,
    jobs: runtime.jobs,
    runtime,
  };
}
