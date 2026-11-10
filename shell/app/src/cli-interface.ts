import type { Plugin } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import type { CLIConfig } from "@brains/chat-repl";

/**
 * The terminal interface `--cli` adds: the chat-repl package's definition,
 * under the plugin id its class had, so its daemon stays `cli:cli`. Loaded
 * only when asked for, which keeps React and Ink out of every other start.
 */
export async function createCliInterface(
  config: CLIConfig | undefined,
): Promise<Plugin[]> {
  const [{ default: cliInterface }, { default: manifest }] = await Promise.all([
    import("@brains/chat-repl"),
    import("@brains/chat-repl/package.json"),
  ]);
  return instantiatePluginPackageDefinition(
    cliInterface,
    config ?? {},
    { name: manifest.name, version: manifest.version },
    { pluginId: "cli" },
  );
}
