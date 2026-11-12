import type { Plugin, PluginCapabilities } from "@brains/plugins";

/** A plugin that registers nothing, told apart from the others by its id. */
export function fixturePlugin(id: string): Plugin {
  return {
    id,
    version: "0.0.0",
    type: "service",
    packageName: "@brains/eval-loader-fixture",
    register: async (): Promise<PluginCapabilities> => ({
      tools: [],
      resources: [],
    }),
  };
}
