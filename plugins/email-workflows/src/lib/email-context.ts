import {
  classEntityServiceOf,
  type ServiceClassEntityService,
  type ServicePermissions,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";

/**
 * The entity service email-workflows reads and writes mail items and reply
 * drafts through, as its class did through its context: a read parsed by
 * the schema it names, as the entity service parses one.
 */
export type EmailEntityService = ServiceClassEntityService;

/** What email-workflows checks and reads through, as its class did. */
export interface EmailContext {
  readonly entityService: EmailEntityService;
  readonly permissions: ServicePermissions;
  readonly channels: {
    getDeliveryProvider: ServiceRuntime["deliveryProvider"];
  };
}

/** What email-workflows checks and reads through, from the runtime. */
export function emailContextOf(runtime: ServiceRuntime): EmailContext {
  return {
    entityService: classEntityServiceOf(runtime),
    permissions: runtime.permissions,
    channels: { getDeliveryProvider: runtime.deliveryProvider },
  };
}
