import type {
  BaseEntity,
  EntitySchema,
  GetEntityRequest,
  IProfileKindsNamespace,
  IRuntimeStateNamespace,
} from "@brains/plugins";
import type { AtprotoProjectionContext } from "@brains/atproto-contracts";
import type {
  ServiceAtprotoProjections,
  ServiceClassMessaging,
  ServiceEntityReads,
  ServiceEntityWrites,
  ServiceIdentity,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
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
  readonly profileKinds: Pick<IProfileKindsNamespace, "getResolved">;
  readonly servesHttp: boolean;
  readonly siteUrl: string | undefined;
  readonly entityDisplay: ServiceRuntime["entityDisplay"];
  readonly publicSkills: ServiceRuntime["publicSkills"];
  readonly atprotoProjections: ServiceAtprotoProjections;
  readonly runtimeState: Pick<IRuntimeStateNamespace, "scoped">;
}

/** The bus atproto hears, as its class subscribed and observed. */
export type AtprotoBus = Pick<ServiceRuntime, "listen">;

/**
 * The entity service a projection is handed, as the class handed its own:
 * a read parsed by the schema it is given, as the entity service parses
 * one, and the class's writes.
 */
function entityServiceOf(
  reads: Pick<ServiceEntityReads, "getEntity" | "listEntities">,
  writes: Pick<ServiceEntityWrites, "updateEntity">,
): AtprotoContext["entityService"] {
  function getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  function getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function getEntity(
    request: GetEntityRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity | null> {
    const entity = await reads.getEntity(request);
    return entity && schema ? schema.parse(entity) : entity;
  }
  return {
    getEntity,
    listEntities: (request) => reads.listEntities(request),
    updateEntity: (request) => writes.updateEntity(request),
  };
}

/** What atproto reads and broadcasts through, from the package's runtime. */
export function atprotoContextOf(runtime: ServiceRuntime): AtprotoContext {
  return {
    logger: runtime.logger,
    entityService: entityServiceOf(runtime.entityReads, runtime.entityWrites),
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
