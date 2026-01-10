/**
 * Test utilities for plugin development
 * Import from "@brains/plugins/test" instead of deep paths
 */
export { MockShell } from "./src/test/mock-shell";
export {
  PluginTestHarness,
  createCorePluginHarness,
  createServicePluginHarness,
  createInterfacePluginHarness,
  type HarnessOptions,
} from "./src/test/harness";

// Re-export commonly used types and schemas for test convenience
export type {
  PluginCapabilities,
  BaseEntity,
  EntityAdapter,
  ServicePluginContext,
  CorePluginContext,
  InterfacePluginContext,
  ToolContext,
  IEntityService,
  ConversationDigestPayload,
  BatchOperation,
} from "./src/index";
// Logger comes from @brains/utils
export type { Logger } from "@brains/utils";
export {
  baseEntitySchema,
  createServicePluginContext,
  createCorePluginContext,
  createInterfacePluginContext,
  PluginError,
} from "./src/index";
