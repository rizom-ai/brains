import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import type { createPluginHarness } from "@brains/plugins/test";
import { obsidianVault, type ObsidianVaultDeps } from "../src";
import type { ObsidianSyncInput } from "../src";

/** The vault service plugin with fake file system deps, as the brain composes it. */
export function obsidianVaultPlugin(deps: Partial<ObsidianVaultDeps>): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    obsidianVault(deps),
    {},
    { name: "@brains/obsidian-vault", version: "0.0.0-test" },
    // Under the id its class had.
    { pluginId: "obsidian-vault" },
  );
  if (!plugin) throw new Error("The vault installs no plugin");
  return plugin;
}

type Harness = ReturnType<typeof createPluginHarness>;
type Registry = ReturnType<Harness["getEntityRegistry"]>;

/**
 * The shapes a sync reads, from where the brain's runtime reads them: the
 * entity service's types, each type's effective frontmatter schema, and the adapter's
 * singleton flag and body template.
 */
export function shapesOf(harness: Harness): ObsidianSyncInput["shapes"] {
  const adapterOf = (
    type: string,
  ): ReturnType<Registry["getAdapter"]> | undefined => {
    try {
      return registry.getAdapter(type);
    } catch {
      // An unregistered type has no adapter, as the runtime's reader says.
      return undefined;
    }
  };
  const registry = harness.getEntityRegistry();
  const entityService = harness.getMockShell().getEntityService();
  return {
    types: () => entityService.getEntityTypes(),
    frontmatterSchema: (type) => registry.getEffectiveFrontmatterSchema(type),
    isSingleton: (type) => adapterOf(type)?.isSingleton === true,
    bodyTemplate: (type) => adapterOf(type)?.getBodyTemplate() ?? "",
  };
}
