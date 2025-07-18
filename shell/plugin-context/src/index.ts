// Export types
export type {
  PluginType,
  BasePlugin,
  CorePlugin,
  CorePluginContext,
  ServicePlugin,
  ServicePluginContext,
  InterfacePlugin,
  InterfacePluginContext,
  PluginCapabilities,
  PluginTool,
  PluginResource,
} from "./types";

// Re-export command types from command-registry
export type { Command, CommandInfo } from "@brains/command-registry";

// Export context creators
export { createCorePluginContext } from "./contexts/corePluginContext";
export type { CoreServices } from "./contexts/corePluginContext";

export { createServicePluginContext } from "./contexts/servicePluginContext";
export type { ServiceServices } from "./contexts/servicePluginContext";

export { createInterfacePluginContext } from "./contexts/interfacePluginContext";
export type { InterfaceServices } from "./contexts/interfacePluginContext";
