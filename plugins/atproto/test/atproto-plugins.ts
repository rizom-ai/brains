import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { atprotoConfigSchema } from "../src/config";
import { buildAtprotoWebRoutes } from "../src/web-routes";
import { createSilentLogger } from "@brains/test-utils";
import type { AtprotoContext } from "../src/atproto-context";
import type { AtprotoConfigInput } from "../src/config";
import { createAtprotoPackage, type AtprotoState } from "../src/package";
import { AtprotoService, type AtprotoPluginDeps } from "../src/plugin";

/**
 * The atproto package's plugin, as the canonical brain installs it under
 * its class's plugin id, with its service's methods as the class offered
 * them: each run on the context the caller hands it, by the service the
 * plugin set up once it registered, or by one of its own before that.
 */
export type AtprotoTestPlugin = Plugin & {
  ready(): Promise<void>;
  shutdown(): Promise<void>;
  getWebRoutes(): WebRouteDefinition[];
  validatePdsCredentials: AtprotoService["validatePdsCredentials"];
  publishBrainCard: AtprotoService["publishBrainCard"];
  publishEntity: AtprotoService["publishEntity"];
  publishPost: AtprotoService["publishPost"];
  discoverBrainCards: AtprotoService["discoverBrainCards"];
  /** The context the plugin's runtime handed its service, once registered. */
  runtimeContext(): AtprotoContext | undefined;
};

export function createAtprotoPlugin(
  config: AtprotoConfigInput = {},
  deps: AtprotoPluginDeps = {},
): AtprotoTestPlugin {
  const parsedConfig = atprotoConfigSchema.parse(config);
  let state: AtprotoState | undefined;
  let standalone: AtprotoService | undefined;
  const service = (): AtprotoService => {
    if (state) return state.atproto;
    standalone ??= new AtprotoService(config, deps, createSilentLogger());
    return standalone;
  };
  const [plugin] = instantiatePluginPackageDefinition(
    createAtprotoPackage({
      ...deps,
      onSetup: (built) => {
        state = built;
      },
    }),
    config,
    { name: "@brains/atproto", version: "0.0.0-test" },
    { pluginId: "atproto" },
  );
  if (!plugin) throw new Error("The atproto package created no plugin");
  const ready = plugin.ready?.bind(plugin);
  const shutdown = plugin.shutdown?.bind(plugin);
  const webRoutes = plugin.getWebRoutes?.bind(plugin);
  return Object.assign(plugin, {
    ready: async (): Promise<void> => {
      await ready?.();
    },
    shutdown: async (): Promise<void> => {
      await shutdown?.();
    },
    // As the class served them: from its config, registered or not.
    getWebRoutes: (): WebRouteDefinition[] =>
      state ? (webRoutes?.() ?? []) : buildAtprotoWebRoutes(parsedConfig),
    validatePdsCredentials: (): Promise<boolean> =>
      service().validatePdsCredentials(),
    publishBrainCard: (
      ...call: Parameters<AtprotoService["publishBrainCard"]>
    ): ReturnType<AtprotoService["publishBrainCard"]> =>
      service().publishBrainCard(...call),
    publishEntity: (
      ...call: Parameters<AtprotoService["publishEntity"]>
    ): ReturnType<AtprotoService["publishEntity"]> =>
      service().publishEntity(...call),
    publishPost: (
      ...call: Parameters<AtprotoService["publishPost"]>
    ): ReturnType<AtprotoService["publishPost"]> =>
      service().publishPost(...call),
    discoverBrainCards: (
      ...call: Parameters<AtprotoService["discoverBrainCards"]>
    ): ReturnType<AtprotoService["discoverBrainCards"]> =>
      service().discoverBrainCards(...call),
    runtimeContext: (): AtprotoContext | undefined => state?.context,
  });
}

/** The atproto package's plugins, as a brain installs them. */
export function createAtprotoPlugins(
  config: AtprotoConfigInput = {},
  deps: AtprotoPluginDeps = {},
): Plugin[] {
  return [createAtprotoPlugin(config, deps)];
}
