import {
  classEntityServiceOf,
  type AuthBackend,
  type ClassRuntimeState,
  type ServiceClassEntityService,
  type ServiceClassMessaging,
  type ServiceEntityReads,
  type ServiceEntityWrites,
  type ServicePermissions,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import type { FetchLike } from "@brains/utils/fetch-like";
import type { ResolveHostname } from "@brains/utils/safe-public-fetch";

/** The entity service agent discovery reads and writes through, as its classes did. */
export type AgentEntityService = ServiceClassEntityService &
  Pick<ServiceEntityWrites, "deleteEntity"> & {
    /** Whether a type is registered. */
    hasEntityType(entityType: string): boolean;
  };

/**
 * What agent discovery's tools, card events, Inbox source, widgets and
 * evals reach, as its classes reached them through their contexts.
 */
export interface AgentContext {
  readonly logger: Logger;
  readonly entityService: AgentEntityService;
  readonly permissions: ServicePermissions;
  readonly auth: { get(): AuthBackend | undefined };
  readonly domain: string | undefined;
  readonly messaging: Pick<ServiceClassMessaging, "request" | "broadcast">;
  readonly semantic: {
    project: ServiceEntityReads["projectSemanticSpace"];
  };
  readonly runtimeState: ClassRuntimeState;
}

/**
 * How agent discovery reaches other brains: the fetch its card and
 * directory reads go through, and the hostname resolver its public-fetch
 * guard checks with. The globals unless a test injects its own, as the
 * classes took them in their constructors.
 */
export interface AgentNetwork {
  readonly fetch?: FetchLike | undefined;
  readonly resolveHostname?: ResolveHostname | undefined;
}

/** Agent discovery's context over a package's runtime. */
export function agentContextOf(runtime: ServiceRuntime): AgentContext {
  const { entityReads } = runtime;
  return {
    logger: runtime.logger,
    entityService: {
      ...classEntityServiceOf(runtime),
      hasEntityType: (entityType) => entityReads.hasEntityType(entityType),
    },
    permissions: runtime.permissions,
    auth: { get: () => runtime.auth() },
    domain: runtime.domain,
    messaging: runtime.messaging,
    semantic: {
      project: (request) => entityReads.projectSemanticSpace(request),
    },
    runtimeState: runtime.classRuntimeState,
  };
}
