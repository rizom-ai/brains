import {
  classEntityServiceOf,
  type ServiceClassEntityService,
  type ServiceEntityReads,
  type ServiceGroupingReads,
  type ServiceRuntime,
  type ServiceStudio,
} from "@brains/sdk/internal/service-runtime";

/**
 * The entity service the board reads and writes cards through, as its class
 * did through context.entityService, and the types the brain holds.
 */
export type BoardEntityService = Pick<
  ServiceClassEntityService,
  | "getEntity"
  | "listEntities"
  | "createEntity"
  | "updateEntity"
  | "deleteEntity"
> &
  Pick<ServiceEntityReads, "getEntityTypes">;

/** What the board, its Inbox source and its tools reach. */
export interface BoardContext {
  readonly entityService: BoardEntityService;
  readonly groupings: ServiceGroupingReads;
  readonly studio: ServiceStudio;
}

/** The board's context over the package's runtime. */
export function boardContextOf(runtime: ServiceRuntime): BoardContext {
  return Object.freeze({
    entityService: Object.freeze({
      ...classEntityServiceOf(runtime),
      getEntityTypes: () => runtime.entityReads.getEntityTypes(),
    } satisfies BoardEntityService),
    groupings: runtime.groupingReads,
    studio: runtime.studio,
  });
}
