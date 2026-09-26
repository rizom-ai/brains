import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { analyticsService } from "../../src";
import type { AnalyticsConfigInput, AnalyticsDependencies } from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The analytics service, as the runtime would build it.
 *
 * Tests used to construct AnalyticsPlugin directly; the package declares
 * itself now, so they go through instantiation instead.
 */
export function analyticsPlugin(
  config: AnalyticsConfigInput = {},
  dependencies: AnalyticsDependencies = {},
): Plugin {
  const definition = analyticsService(dependencies);
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Analytics plugin was not created");
  return plugin;
}
