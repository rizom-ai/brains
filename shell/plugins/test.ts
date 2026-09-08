/**
 * Test utilities for plugin development
 * Import from "@brains/plugins/test" instead of deep paths
 */
export { createRequester } from "./src/internal/requester";
export { createTestEntityAdapter } from "@brains/entity-service/test";
export {
  createMemoryRuntimeStateNamespace,
  createMockShell,
  type MockShell,
  type MockShellOptions,
} from "./src/test/mock-shell";
export { createMockAppInfo } from "./src/test/mock-app-info";
export {
  createMockServicePluginContext,
  type MockServicePluginContext,
  type MockServicePluginContextOptions,
  type MockServicePluginContextReturns,
} from "./src/test/mock-service-plugin-context";
export {
  createMockEntityPluginContext,
  type MockEntityPluginContext,
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
  createTempDataDir,
  createTempDataDirSync,
  removeTrackedTempDataDirs,
} from "./src/test/temp-dir";
export { expectTemplateDataSourcesResolve } from "./src/test/template-data-sources";

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
export { createTestEntityAccess } from "./src/test/entity-access";
export { createTestAppInfo } from "./src/test/app-info";
export {
  createStubAuth,
  createTestPrincipal,
  type StubAuthOptions,
} from "./src/test/stub-auth";
export { createTestJobContext, runServiceJob } from "./src/test/job-context";
export {
  fetchable,
  type FetchableDataSource,
} from "./src/test/fetchable-data-source";
export { coverTakingType } from "./src/test/cover-taking-type";
