/**
 * Test utilities for plugin development
 * Import from "@brains/plugins/test" instead of deep paths
 */
export { createTestEntityAdapter } from "@brains/entity-service/test";
export {
  createMemoryRuntimeStateNamespace,
  createMockShell,
  type MockShell,
  type MockShellOptions,
} from "./src/test/mock-shell";
export { createMockAppInfo } from "./src/test/mock-app-info";
export { registerAll } from "./src/test/register-all";
export {
  probeRuntime,
  probeService,
  type ProbeServiceOptions,
} from "./src/test/probe-service-runtime";
export { firstPartyJobHandlerFor } from "./src/test/first-party-job-handler";
export { MemoryAccountSettingsBackend } from "./src/test/memory-account-settings-backend";
export { createMockAuthBackend } from "./src/test/mock-auth-backend";
export {
  createMockServicePluginContext,
  type MockServicePluginContext,
  type MockServicePluginContextOptions,
  type MockServicePluginContextReturns,
} from "./src/test/mock-service-plugin-context";
export {
  createMockEntityPluginContext,
  type MockEntityPluginContextOptions,
} from "./src/test/mock-entity-plugin-context";
export {
  PluginTestHarness,
  createPluginHarness,
  expectSuccess,
  expectError,
  confirmationArgs,
  expectConfirmation,
  type HarnessOptions,
} from "./src/test/harness";
export {
  refuseEnqueues,
  type EnqueueRefusals,
} from "./src/test/refuse-enqueues";
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
  BatchOperation,
} from "./src/index";
// Logger comes from @brains/utils
export type { Logger } from "@brains/utils/logger";
// A bus double that delivers to its subscribers, for a test that sends on the
// bus a context rides as the shell does.
export { createMockMessageBus } from "./src/test/mock-message-bus";
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
