/**
 * Test utilities for plugin development
 * Import from "@brains/plugins/test" instead of deep paths
 */
export { createMockShell, type MockShell } from "@brains/test-utils";
export {
  PluginTestHarness,
  createPluginHarness,
  expectSuccess,
  expectError,
  expectConfirmation,
  type HarnessOptions,
} from "./src/test/harness";
export {
  createTempDataDir,
  createTempDataDirSync,
  removeTrackedTempDataDirs,
} from "./src/test/temp-dir";

// Re-export commonly used types and schemas for test convenience
export type {
  PluginCapabilities,
  BaseEntity,
  EntityAdapter,
  ServicePluginContext,
  EntityPluginContext,
  BasePluginContext,
  InterfacePluginContext,
  ToolContext,
  IEntityService,
  IMessageBus,
  ConversationDigestPayload,
  BatchOperation,
} from "./src/index";
// Logger comes from @brains/utils
export type { Logger } from "@brains/utils/logger";
export { createMockMessageBus } from "@brains/messaging-service/test";
export {
  baseEntitySchema,
  emptyFrontmatterSchema,
  BaseEntityAdapter,
  createServicePluginContext,
  createEntityPluginContext,
  createBasePluginContext,
  createInterfacePluginContext,
  PluginError,
  PermissionService,
} from "./src/index";
