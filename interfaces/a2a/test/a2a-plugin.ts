import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import packageJson from "../package.json";
import { createA2AInterface, type A2AInterfaceDeps } from "../src";
import type { A2AConfigInput } from "../src/config";

/**
 * The A2A interface as the brain creates it, with the collaborators a test
 * hands it: the package's definition, under the plugin id its class had.
 * The one place the tests name how it is built, so they read the same
 * before and after it was declared.
 */
export function createA2APlugin(
  config: A2AConfigInput = {},
  deps: A2AInterfaceDeps = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    createA2AInterface(deps),
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "a2a" },
  );
  if (!plugin) throw new Error("The A2A definition created no plugin");
  return plugin;
}

/** A route the plugin serves, read where the shell reads it. */
export function routeOf(
  plugin: Plugin,
  method: string,
  path: string,
): NonNullable<ReturnType<NonNullable<Plugin["getWebRoutes"]>>[number]> {
  const route = (
    "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
      ? plugin.getWebRoutes()
      : []
  ).find((candidate) => candidate.path === path && candidate.method === method);
  if (!route) throw new Error(`Expected ${method} ${path}`);
  return route;
}

/**
 * The shared host the card and JSON-RPC routes mount on, present as a
 * registered plugin.
 */
export const webserverPlugin: Plugin = {
  id: "webserver",
  version: "1.0.0",
  type: "interface",
  packageName: "@brains/webserver",
  register: async () => ({ tools: [], resources: [] }),
};
