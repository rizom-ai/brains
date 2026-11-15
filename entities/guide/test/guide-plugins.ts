import {
  instantiatePluginPackageDefinition,
  type DataSource,
  type Plugin,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";
import { guidesPackage } from "../src";
import packageJson from "../package.json";

/**
 * The guide package's plugins, as the canonical brain installs them: under
 * the guides class's plugin id.
 */
export function createGuidePlugins(
  config: Record<string, unknown> = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    guidesPackage,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "guides" },
  );
}

/** The guide package installed on a test shell, as a brain registers it. */
export async function installGuides(
  shell: MockShell,
  config: Record<string, unknown> = {},
): Promise<string | undefined> {
  let instructions: string | undefined;
  for (const plugin of createGuidePlugins(config)) {
    instructions = (await plugin.register(shell)).instructions;
  }
  return instructions;
}

/** A fetching data source the guide package registered, by its registered id. */
export function guideDataSourceOn(
  shell: MockShell,
  id: string,
): Required<Pick<DataSource, "fetch">> {
  const fetch = shell.getDataSourceRegistry().get(id)?.fetch;
  if (!fetch) throw new Error(`No fetching data source ${id}`);
  return { fetch };
}
