// Export types
export type {
  Command,
  PluginType,
  BasePlugin,
  CorePlugin,
  CorePluginContext,
  ServicePlugin,
  ServicePluginContext,
  PluginCapabilities,
  PluginTool,
  PluginResource,
} from "./types";

// Export context creators
export { createCorePluginContext } from "./contexts/corePluginContext";
export type { CoreServices } from "./contexts/corePluginContext";

export { createServicePluginContext } from "./contexts/servicePluginContext";
export type { ServiceServices } from "./contexts/servicePluginContext";
