import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import packageJson from "../package.json";
import { createWebChatInterface, type WebChatDeps } from "../src";
import type { WebChatConfigInput } from "../src/config";

/** The web chat plugin as the shell holds it: its routes, and ready. */
export type WebChatPlugin = Plugin & {
  getWebRoutes(): WebRouteDefinition[];
  ready(): Promise<void>;
};

function isWebChatPlugin(plugin: Plugin): plugin is WebChatPlugin {
  return (
    typeof plugin.getWebRoutes === "function" &&
    typeof plugin.ready === "function"
  );
}

/**
 * The web chat interface as the brain creates it, with the collaborators a
 * test hands it: the package's definition, under the plugin id its class
 * had. The one place the tests name how it is built, so they read the same
 * before and after it was declared.
 */
export function createWebChatPlugin(
  config: WebChatConfigInput = {},
  deps: WebChatDeps = {},
): WebChatPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    createWebChatInterface(deps),
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "web-chat" },
  );
  if (!plugin || !isWebChatPlugin(plugin)) {
    throw new Error("The web chat definition created no plugin");
  }
  return plugin;
}
