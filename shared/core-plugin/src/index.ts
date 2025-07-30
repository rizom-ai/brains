// Core plugin base class
export { CorePlugin } from "./core-plugin";

// Core plugin context
export type { CorePluginContext } from "./context";
export { createCorePluginContext } from "./context";

// Re-export commonly used types from plugin-base
export type {
  Plugin,
  PluginType,
  PluginCapabilities,
  PluginTool,
  PluginResource,
  ToolContext,
  ContentGenerationConfig,
} from "@brains/plugin-base";

// Re-export commonly used utilities from plugin-base
export {
  toolInput,
  PluginInitializationError,
  PluginContextError,
} from "@brains/plugin-base";

// Test harness
export { CorePluginTestHarness } from "./test/harness";
