import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins/test";
import { RouteRegistry, UISlotRegistry } from "@brains/site-engine";
import { siteBuilderService } from "../../src";
import type { SiteBuilderConfigInput } from "../../src/config";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const SITE_BUILDER_PLUGIN_ID: string = `${packageJson.name}:site-builder`;

export interface SiteBuilderRegistries {
  readonly routes: RouteRegistry;
  readonly slots: UISlotRegistry;
  /** Scripts other packages asked to have injected into every page head. */
  readonly headScripts: Map<string, string>;
}

/** The site builder as the runtime builds it from one configuration. */
export function instantiate(
  config: SiteBuilderConfigInput = {},
  registries?: SiteBuilderRegistries,
): Plugin {
  const definition = siteBuilderService(registries ?? {});
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Site builder plugin was not created");
  return plugin;
}

export interface InstalledSiteBuilder extends SiteBuilderRegistries {
  readonly plugin: Plugin;
  readonly capabilities: PluginCapabilities;
}

/**
 * Install the site builder, holding the registries it registered into.
 *
 * A test asserting what another package registered needs the same registry
 * the service used, which is why they are supplied rather than read back.
 */
export async function installSiteBuilder(
  harness: PluginTestHarness<Plugin>,
  config: SiteBuilderConfigInput = {},
): Promise<InstalledSiteBuilder> {
  const registries: SiteBuilderRegistries = {
    routes: new RouteRegistry(harness.getMockShell().getLogger()),
    slots: new UISlotRegistry(),
    headScripts: new Map<string, string>(),
  };
  const plugin = instantiate(config, registries);
  const capabilities = await harness.installPlugin(plugin);
  // Operator surfaces are bound once every package has registered, which is
  // what the runtime does after the last install.
  await harness.finalizeRegistration();
  return { plugin, capabilities, ...registries };
}
