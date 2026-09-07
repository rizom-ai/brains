import {
  bindPluginPackageMetadata,
  createServicePluginContext,
  instantiatePluginPackageDefinition,
  SYSTEM_CHANNELS,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  atprotoConfigSchema,
  atprotoService,
  createAtprotoPublisher,
  type AtprotoAnnouncer,
  type AtprotoConfigInput,
  type AtprotoPublisher,
  type AtprotoServiceDeps,
} from "../../src";
import type { JetstreamRuntime } from "../../src/jetstream-consumer";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const ATPROTO_PLUGIN_ID: string = `${packageJson.name}:atproto`;

export type MockShell = ReturnType<typeof createMockShell>;

/** The plugin the runtime builds from one config, with a test's collaborators. */
export function instantiate(
  config: AtprotoConfigInput = {},
  deps: AtprotoServiceDeps = {},
): Plugin {
  const definition = atprotoService(deps);
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("AT Protocol service plugin was not created");
  return plugin;
}

/**
 * The routes one configuration serves, as the shared HTTP host mounts them.
 *
 * Registered first: a route is built from what setup returned, so a plugin
 * that has not registered has no state to answer from — which is also how
 * the production collector reads routes, from registered plugins.
 */
export async function routesFor(
  config: AtprotoConfigInput = {},
  deps: AtprotoServiceDeps = {},
): Promise<WebRouteDefinition[]> {
  const plugin = instantiate(config, deps);
  await plugin.register(createMockShell());
  return plugin.getWebRoutes?.() ?? [];
}

/**
 * The publisher over a shell's reads, built the way the service builds it at
 * setup: the brain's presentation and the entity reads come from the shell,
 * the PDS client and fetch from the test.
 */
export function publisherFor(
  shell: MockShell,
  config: AtprotoConfigInput = {},
  deps: AtprotoServiceDeps = {},
): AtprotoPublisher {
  const context = createServicePluginContext(shell, "atproto");
  return createAtprotoPublisher({
    config: atprotoConfigSchema.parse(config),
    brain: context,
    entities: context.entityService,
    logger: context.logger,
    deps,
  });
}

/** Announcements go to the shell's bus, as ready and subscription handlers do. */
export function announcerFor(shell: MockShell): AtprotoAnnouncer {
  return {
    publish: async ({ topic, data }): Promise<void> => {
      await shell.getMessageBus().send({
        type: topic,
        payload: data,
        sender: "atproto",
        broadcast: true,
      });
    },
  };
}

/**
 * Real boots broadcast pluginsRegistered before ready; startup-check boots
 * never do. Tests that expect boot publishing arm the full-boot signal.
 */
export async function armFullBoot(shell: MockShell): Promise<void> {
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "test",
    broadcast: true,
  });
}

/** A shell whose brain has a resolved profile kind, so a card can be built. */
export function createProfiledShell(
  options: {
    domain?: string;
    kind?: string;
    category?: "person" | "organization";
    web?: boolean;
  } = {},
): MockShell {
  const kind = options.kind ?? "professional";
  const shell = createMockShell({
    ...(options.domain && { domain: options.domain }),
    profileKind: kind,
    httpConfigured: options.web ?? false,
  });
  shell.getProfileKindRegistry().register("test", {
    kind,
    category: options.category ?? "person",
    fields: z.object({}),
    labels: { singular: kind, plural: `${kind}s` },
  });
  shell.getProfileKindRegistry().finalize();
  return shell;
}

/** What the Jetstream consumer needs of the runtime, over a shell. */
export function jetstreamRuntimeFor(shell: MockShell): JetstreamRuntime {
  const context = createServicePluginContext(shell, "atproto");
  return {
    logger: context.logger,
    state: (options) => context.runtimeState.scoped(options),
  };
}
