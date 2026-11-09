import type { Plugin } from "@brains/plugins";
import { A2AInterface, type A2AInterfaceDeps } from "../src/a2a-interface";
import type { A2AConfigInput } from "../src/config";

/**
 * The A2A interface as the brain creates it, with the collaborators a test
 * hands it. The one place the tests name how it is built, so they read the
 * same before and after it is declared.
 */
export function createA2APlugin(
  config: A2AConfigInput = {},
  deps: A2AInterfaceDeps = {},
): Plugin {
  return new A2AInterface(config, deps);
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
