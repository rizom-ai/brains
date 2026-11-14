import {
  classEntityServiceOf,
  type ClassRuntimeState,
  type ServiceRuntime,
  type ServiceAtprotoProjections,
  type ServiceClassMessaging,
  type ServiceEntityReads,
  type ServiceIdentity,
} from "@brains/sdk/internal/service-runtime";
import type { AtprotoProjectionContext } from "@brains/atproto-contracts";
import type { Logger } from "@brains/utils/logger";

/**
 * What atproto reads, broadcasts and keeps, as its class did through its
 * plugin context: records of any type, the brain's identity, profile kind,
 * site, public skills and the projections entity packages registered, its
 * Jetstream cursor under the namespace the class named, and the events it
 * broadcasts.
 */
export interface AtprotoContext {
  readonly logger: Logger;
  /** Its reads, and the entity service a projection is handed, as the class handed its own. */
  readonly entityService: AtprotoProjectionContext["entityService"] &
    Pick<ServiceEntityReads, "listEntities">;
  readonly messaging: Pick<ServiceClassMessaging, "broadcast">;
  readonly identity: ServiceIdentity;
  readonly profileKinds: Pick<ServiceRuntime["profileKinds"], "getResolved">;
  readonly servesHttp: boolean;
  readonly siteUrl: string | undefined;
  readonly entityDisplay: ServiceRuntime["entityDisplay"];
  readonly publicSkills: ServiceRuntime["publicSkills"];
  readonly atprotoProjections: ServiceAtprotoProjections;
  readonly runtimeState: ClassRuntimeState;
}

/** The bus atproto hears, as its class subscribed and observed. */
export type AtprotoBus = Pick<ServiceRuntime, "listen">;

/** What atproto reads and broadcasts through, from the package's runtime. */
export function atprotoContextOf(runtime: ServiceRuntime): AtprotoContext {
  return {
    logger: runtime.logger,
    entityService: classEntityServiceOf(runtime),
    messaging: runtime.messaging,
    identity: runtime.identity,
    profileKinds: runtime.profileKinds,
    servesHttp: runtime.servesHttp,
    siteUrl: runtime.siteUrl,
    entityDisplay: runtime.entityDisplay,
    publicSkills: runtime.publicSkills,
    atprotoProjections: runtime.atprotoProjections,
    runtimeState: runtime.classRuntimeState,
  };
}
