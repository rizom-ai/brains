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
  BaseEntityAdapter,
  createServicePluginContext,
  createEntityPluginContext,
  createBasePluginContext,
  createInterfacePluginContext,
  PluginError,
  PermissionService,
} from "./src/index";
