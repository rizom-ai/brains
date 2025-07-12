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
  MessageContext,
  IMessageInterfacePlugin,
  ContentGenerationConfig,
  GenerateContentFunction,
} from "./interfaces";

export { pluginMetadataSchema, DaemonHealthSchema } from "./interfaces";

// Plugin base classes
export { BasePlugin } from "./base-plugin";
export { InterfacePlugin } from "./interface-plugin";

// Plugin utilities
export { validatePluginConfig, createPluginConfig } from "./config";
export { PluginConfigBuilder, pluginConfig, toolInput } from "./config-builder";
export type { PluginLifecycleHook } from "./lifecycle";

// Plugin errors
export { PluginInitializationError } from "./errors";
