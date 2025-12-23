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
  Logger,
  IEntityService,
  ConversationDigestPayload,
  BatchOperation,
} from "./src/index";
export {
  baseEntitySchema,
  createServicePluginContext,
  createCorePluginContext,
  createInterfacePluginContext,
  PluginError,
} from "./src/index";
