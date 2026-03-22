/**
 * Test utilities for plugin development
 * Import from "@brains/plugins/test" instead of deep paths
 */
export { createMockShell, type MockShell } from "./src/test/mock-shell";
export {
  PluginTestHarness,
  createPluginHarness,
  expectSuccess,
  expectError,
  expectConfirmation,
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
  BaseEntityAdapter,
  createServicePluginContext,
  createCorePluginContext,
  createInterfacePluginContext,
  PluginError,
  PermissionService,
} from "./src/index";
