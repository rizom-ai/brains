// Plugin types and interfaces
export type {
  DaemonHealth,
  Daemon,
  ToolVisibility,
  PluginTool,
  PluginResource,
  PluginCapabilities,
  Plugin,
  PluginContext,
  IInterfacePlugin,
  IMessageInterfacePlugin,
  ContentGenerationConfig,
  GenerateContentFunction,
} from "./interfaces";

export { pluginMetadataSchema, DaemonHealthSchema } from "./interfaces";

// Plugin base classes
export { BasePlugin } from "./base-plugin";
export { InterfacePlugin } from "./interface-plugin";

// Plugin utilities
export { validatePluginConfig, basePluginConfigSchema } from "./config";

// Plugin errors
export { PluginInitializationError } from "./errors";
