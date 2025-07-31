// Plugin base class and core context
export { BasePlugin, type CoreContext } from "./base-plugin";

// Plugin types and interfaces
export type {
  PluginType,
  DaemonHealth,
  Daemon,
  ToolVisibility,
  ToolContext,
  PluginTool,
  PluginResource,
  PluginCapabilities,
  Plugin,
  IInterfacePlugin,
  ContentGenerationConfig,
  GenerateContentFunction,
  IMessageInterfacePlugin,
} from "./interfaces";

export {
  pluginMetadataSchema,
  DaemonHealthSchema,
  ToolContextRoutingSchema,
} from "./interfaces";

// Config utilities
export {
  basePluginConfigSchema,
  validatePluginConfig,
  mergePluginConfig,
  type PluginConfigInput,
  type PluginConfig,
} from "./config";

// Errors
export { PluginInitializationError, PluginContextError } from "./errors";
