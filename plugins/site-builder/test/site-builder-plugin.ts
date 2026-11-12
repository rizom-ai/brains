import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import type { UISlotRegistry } from "@brains/site-engine";
import type { StaticSiteOutput } from "@brains/plugins/internal/http-host";
import type { RouteDefinition } from "@brains/site-composition";
import {
  createSiteBuilderPackage,
  type SiteBuilderConfigInput,
  type SiteBuilderState,
} from "../src/plugin";
import type { SiteBuilder } from "../src/lib/site-builder";
import packageJson from "../package.json";

/**
 * The site-builder package's plugin, as the canonical brain installs it
 * under its class's plugin id, with what a test reads of its pipeline once
 * it has registered.
 */
export type SiteBuilderTestPlugin = Plugin & {
  ready(): Promise<void>;
  getStaticSiteOutput(): StaticSiteOutput | undefined;
  getSiteBuilder(): SiteBuilder | undefined;
  getHeadScripts(): Promise<string[]>;
  getPages(): Promise<RouteDefinition[]>;
  getSlots(): Promise<UISlotRegistry>;
  instructions(): Promise<string | undefined>;
};

export function createSiteBuilderPlugin(
  config: SiteBuilderConfigInput = {},
): SiteBuilderTestPlugin {
  let state: SiteBuilderState | undefined;
  const registered = (): SiteBuilderState => {
    if (!state) throw new Error("The site builder has not registered");
    return state;
  };
  const [plugin] = instantiatePluginPackageDefinition(
    createSiteBuilderPackage({
      onSetup: (built) => {
        state = built;
      },
    }),
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "site-builder" },
  );
  if (!plugin) throw new Error("The site-builder package created no plugin");
  const ready = plugin.ready?.bind(plugin);
  const output = plugin.getStaticSiteOutput?.bind(plugin);
  return Object.assign(plugin, {
    ready: async (): Promise<void> => {
      await ready?.();
    },
    getStaticSiteOutput: (): StaticSiteOutput | undefined => output?.(),
    getSiteBuilder: (): SiteBuilder | undefined => state?.builder,
    getHeadScripts: (): Promise<string[]> => registered().getHeadScripts(),
    getPages: (): Promise<RouteDefinition[]> => registered().getPages(),
    getSlots: (): Promise<UISlotRegistry> => registered().getSlots(),
    instructions: (): Promise<string | undefined> =>
      registered().instructions(),
  });
}
