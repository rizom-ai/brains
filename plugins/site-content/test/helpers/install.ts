import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins/test";
import { siteContentService } from "../../src";
import type { SiteContentPluginConfigInput } from "../../src/schemas/config";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const SECTIONS_PLUGIN_ID: string = `${packageJson.name}:sections`;

/** Both plugins the package produces: the sections service and its entity. */
export function instantiate(config: SiteContentPluginConfigInput = {}): {
  service: Plugin;
  entity: Plugin;
} {
  const definition = siteContentService();
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const plugins = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  const service = plugins.find(({ type }) => type === "service");
  const entity = plugins.find(({ type }) => type === "entity");
  if (!service || !entity) {
    throw new Error("Site content package did not produce both plugins");
  }
  return { service, entity };
}

/**
 * Both plugins installed, entity first so the service can find its type.
 * The capabilities are the service's, which is what the tool tests read.
 */
export async function installSiteContent(
  harness: PluginTestHarness,
  config: SiteContentPluginConfigInput = {},
): Promise<{
  service: Plugin;
  entity: Plugin;
  capabilities: PluginCapabilities;
}> {
  const plugins = instantiate(config);
  await harness.installPlugin(plugins.entity);
  const capabilities = await harness.installPlugin(plugins.service);
  return { ...plugins, capabilities };
}
