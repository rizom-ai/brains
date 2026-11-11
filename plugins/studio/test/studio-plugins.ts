import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
  type WebRouteDefinition,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  createStudioPackage,
  type StudioPluginConfigInput,
} from "../src/plugin";
import { registerGroupingDefinitions } from "../src/grouping-definitions";
import type { GroupingDefinitionSource } from "../src/grouping-definition-source";
import { studioContextOf, type StudioContext } from "../src/studio-context";
import packageJson from "../package.json";

const metadata = { name: packageJson.name, version: packageJson.version };

/** The Studio service as a test drives it: its routes, finalization and shutdown. */
export type StudioPlugin = Plugin & {
  getWebRoutes(): WebRouteDefinition[];
  finalizeRegistration(): Promise<void>;
  shutdown(): Promise<void>;
};

/** The Studio package's plugins, as a brain installs them: its type, then the service. */
export function createStudioPlugins(
  config: StudioPluginConfigInput = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createStudioPackage(),
    config,
    metadata,
    { pluginId: "studio" },
  );
}

/**
 * The Studio service as a test drives it: registering it installs the
 * grouping definitions type it owns first, as the package installs both.
 */
export function studioPlugin(
  config: StudioPluginConfigInput = {},
): StudioPlugin {
  const plugins = createStudioPlugins(config);
  const service = plugins.find((plugin) => plugin.id === "studio");
  if (
    !service?.getWebRoutes ||
    !service.finalizeRegistration ||
    !service.shutdown
  )
    throw new Error("The package installs no Studio service");
  const owned = plugins.filter((plugin) => plugin !== service);
  const { register, getWebRoutes, finalizeRegistration, shutdown } = service;
  return Object.assign(service, {
    register: async (
      ...args: Parameters<Plugin["register"]>
    ): ReturnType<Plugin["register"]> => {
      for (const plugin of owned) await plugin.register(...args);
      return register.apply(service, args);
    },
    getWebRoutes: (): WebRouteDefinition[] => getWebRoutes.call(service),
    finalizeRegistration: (): Promise<void> =>
      finalizeRegistration.call(service),
    shutdown: (): Promise<void> => shutdown.call(service),
  });
}

/** The runtime Studio reaches on a test shell, under its plugin id. */
export async function studioRuntime(
  shell: MockShell,
  options: { executionOnly?: boolean } = {},
): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "studio",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    metadata,
    { pluginId: "studio" },
  );
  if (!plugin) throw new Error("No probe plugin");
  await plugin.register(
    shell,
    options.executionOnly ? { executionOnly: true } : undefined,
  );
  if (!runtime) throw new Error("The probe did not set up");
  return runtime;
}

/** Studio's context on a test shell, as its package builds it. */
export async function studioContextOn(
  shell: MockShell,
): Promise<StudioContext> {
  return studioContextOf(await studioRuntime(shell));
}

/**
 * Studio's grouping definitions installed on a test shell, as its package
 * installs them: the type it owns, then, once every plugin has registered,
 * the definitions source; and the context its editor reads through.
 */
export async function installStudioGroupings(shell: MockShell): Promise<{
  context: StudioContext;
  source: GroupingDefinitionSource;
}> {
  for (const plugin of createStudioPlugins()) {
    if (plugin.id !== "studio") await plugin.register(shell);
  }
  const runtime = await studioRuntime(shell);
  const context = studioContextOf(runtime);
  return {
    context,
    source: registerGroupingDefinitions(context, runtime.groupings()),
  };
}
