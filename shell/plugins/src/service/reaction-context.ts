import type { ServicePluginContext } from "./context";
import type { LoggerContract } from "@brains/utils/logger";
import type { EntityReactionContext } from "../entity/entity-definition-contract";
import type { RuntimeStateScopeOptions } from "@brains/runtime-state";
import { createJobEntityAccess } from "../job/job-entity-access";

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
  readonly context: ServicePluginContext;
  readonly pluginId: string;
  /**
   * What notes are filed under. The package, not the plugin: a package that
   * installs an entity plugin and a service plugin has one of each writing
   * and reading the same notes, and scoping them apart means what the entity
   * side notices the service side never sees.
   */
  readonly packageName: string;
  readonly entityTypes: Iterable<string>;
  readonly logger: LoggerContract;
}): EntityReactionContext {
  const { context, pluginId } = input;
  return {
    entities: createJobEntityAccess(
      context.entityService,
      new Set(input.entityTypes),
      pluginId,
    ),
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
        namespace: `${input.packageName}.${options.namespace}`,
      }),
    permissions: context.permissions,
    auth: context.auth,
    domain: context.domain,
    siteUrl: context.siteUrl,
    logger: input.logger,
  };
}
