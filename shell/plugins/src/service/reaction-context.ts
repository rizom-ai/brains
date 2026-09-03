import type { ServicePluginContext } from "./context";
import type { LoggerContract } from "@brains/utils/logger";
import type { EntityReactionContext } from "../entity/entity-definition-contract";
import type { JobEntityAccess } from "../job/job-context-contract";
import type { IPermissionsNamespace } from "../public/types";
import type { ICoreEntityService } from "@brains/entity-service";
import type { RuntimeStateScopeOptions } from "@brains/runtime-state";
import { stateNamespaceFor } from "../internal/state-namespace";

/**
 * What building a reaction context actually reads.
 *
 * Narrower than a service context on purpose: an interface builds one too,
 * for the tools that only make sense through it. Everything named here is on
 * the base context both families already receive — entity access is not,
 * because a service writes the types it declares and an interface declares
 * none, so each supplies its own.
 */
export interface ReactionContextSource {
  /**
   * Reads only. Writes come from the entity access each family supplies:
   * a service writes the types it declares, an interface declares none.
   */
  readonly entityService: ICoreEntityService;
  readonly messaging: Pick<ServicePluginContext["messaging"], "send">;
  readonly runtimeState: ServicePluginContext["runtimeState"];
  /**
   * Whether this actor may do a thing to a type. The narrow check, not the
   * service's runtime-principal surface: a reaction asks whether an act is
   * allowed, never who the deployment's principals are.
   */
  readonly permissions: IPermissionsNamespace;
  readonly auth: ServicePluginContext["auth"];
  readonly domain: string | undefined;
  readonly siteUrl: string | undefined;
}

/**
 * The context a declared reaction — a check, an inbox action, a tool — runs
 * in.
 *
 * Built here rather than inline in the plugin so a test can drive a
 * declaration without standing up the plugin that would normally call it.
 * A declaration is a plain object; what makes it hard to test is only ever
 * the context.
 */
export function createReactionContext(input: {
  readonly context: ReactionContextSource;
  /**
   * What notes are filed under. The package, not the plugin: a package that
   * installs an entity plugin and a service plugin has one of each writing
   * and reading the same notes, and scoping them apart means what the entity
   * side notices the service side never sees.
   */
  readonly packageName: string;
  readonly entities: JobEntityAccess;
  readonly logger: LoggerContract;
}): EntityReactionContext {
  const { context } = input;
  return {
    entities: input.entities,
    messaging: {
      publish: async (message: {
        readonly topic: string;
        readonly data: object;
      }): Promise<void> => {
        await context.messaging.send({
          type: message.topic,
          payload: message.data,
        });
      },
    },
    // Namespaced under the declaring package, so two packages cannot read
    // or corrupt each other's notes — and so one package's plugins can.
    state: <TValue>(options: RuntimeStateScopeOptions<TValue>) =>
      context.runtimeState.scoped({
        ...options,
        namespace: stateNamespaceFor(input.packageName, options.namespace),
      }),
    permissions: context.permissions,
    auth: context.auth,
    domain: context.domain,
    siteUrl: context.siteUrl,
    logger: input.logger,
  };
}
