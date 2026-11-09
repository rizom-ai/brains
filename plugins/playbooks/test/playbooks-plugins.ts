import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  createPlaybooksPackage,
  type PlaybooksConfigInput,
  type PlaybooksPackageDeps,
} from "../src";

/**
 * The playbook type's plugin and the playbooks service, as the canonical
 * brain composes the package, in the order they register.
 */
export function createPlaybooksPlugins(
  config: PlaybooksConfigInput = {},
  deps: PlaybooksPackageDeps = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createPlaybooksPackage(deps),
    config,
    { name: "@brains/playbooks", version: "0.0.0-test" },
    // Under the id its class had; its type installs as playbook.
    { pluginId: "playbooks" },
  );
}
