import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import atprotoRegistryPackage, {
  type AtprotoRegistryConfigInput,
} from "../src";

/** The registry's service plugin, as the canonical brain composes it. */
export function atprotoRegistryPlugin(
  config: AtprotoRegistryConfigInput = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    atprotoRegistryPackage,
    config,
    { name: "@brains/atproto-registry", version: "0.0.0-test" },
    // Under the id its class had, with its tools' names.
    { pluginId: "atproto-registry" },
  );
  if (!plugin) throw new Error("The registry installs no plugin");
  return plugin;
}
