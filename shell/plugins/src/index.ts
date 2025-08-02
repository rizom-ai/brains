// Plugin base class and core context
export { BasePlugin, type CoreContext } from "./base-plugin";

// Plugin types and interfaces
export type {
  IShell,
  SystemCommandRegisterEvent,
  SystemToolRegisterEvent,
  SystemResourceRegisterEvent,
  DefaultQueryResponse,
  SimpleTextResponse,
  CreateEntityResponse,
  UpdateEntityResponse,
  PluginType,
  DaemonHealth,
  Daemon,
  ToolVisibility,
  ToolContext,
  PluginTool,
  PluginResource,
  PluginCapabilities,
  Plugin,
  ContentGenerationConfig,
  GenerateContentFunction,
} from "./interfaces";

export {
  systemCommandRegisterSchema,
  systemToolRegisterSchema,
  systemResourceRegisterSchema,
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
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
export {
  PluginError,
  PluginRegistrationError,
  PluginDependencyError,
  PluginInitializationError,
  PluginContextError,
} from "./errors";

// Plugin Manager
export {
  PluginManager,
  PluginRegistrationHandler,
  PluginStatus,
  PluginEvent,
  type IPluginManager,
  type PluginInfo,
  type PluginManagerEventMap,
  type PluginToolRegisterEvent,
  type PluginResourceRegisterEvent,
} from "./manager";
