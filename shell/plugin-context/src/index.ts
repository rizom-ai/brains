// Export types
export type {
  Command,
  PluginType,
  BasePlugin,
  CorePlugin,
  CorePluginContext,
  EntityPlugin,
  EntityPluginContext,
  PluginCapabilities,
  PluginTool,
  PluginResource,
} from "./types";

// Export context creators
export { createCorePluginContext } from "./contexts/corePluginContext";
export type { CoreServices } from "./contexts/corePluginContext";

export { createEntityPluginContext } from "./contexts/entityPluginContext";
export type { EntityServices } from "./contexts/entityPluginContext";
