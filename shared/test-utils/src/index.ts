/**
 * @brains/test-utils
 *
 * Shared test utilities for the brains project.
 * Provides mock builders and helpers to reduce test boilerplate.
 *
 * Every factory is checked against the type it stands in for — `satisfies` on
 * the literal, `PublicSurface<T>` for class types, `genericSpy` where bun's
 * `mock()` erases type parameters — so interface drift fails to compile here
 * rather than leaving a silently stale mock. Test files need no casts of
 * their own.
 */

// Logger utilities
export {
  createSilentLogger,
  createTestLogger,
  createMockLogger,
} from "./mock-logger";

// Entity service mocks
export {
  createMockEntityService,
  type MockEntityServiceOptions,
  type MockEntityServiceReturns,
} from "./mock-entity-service";

// Progress reporter mocks
export { createMockProgressReporter } from "./mock-progress-reporter";
export { stubMethod } from "./stub-method";

// Service plugin context mocks
export {
  createMockServicePluginContext,
  type MockServicePluginContext,
  type MockServicePluginContextOptions,
  type MockServicePluginContextReturns,
} from "./mock-service-plugin-context";

// Entity plugin context mocks
export {
  createMockEntityPluginContext,
  type MockEntityPluginContext,
  type MockEntityPluginContextOptions,
} from "./mock-entity-plugin-context";

// AI service mocks
export {
  createMockAIService,
  type MockAIServiceOptions,
  type MockAIServiceReturns,
} from "./mock-ai-service";

// Job queue service mocks
export {
  createMockJobQueueService,
  type MockJobQueueServiceOptions,
  type MockJobQueueServiceReturns,
} from "./mock-job-queue-service";

// DataSource registry mocks
export {
  createMockDataSourceRegistry,
  type MockDataSourceRegistryOptions,
  type MockDataSourceRegistryReturns,
} from "./mock-datasource-registry";

// Template registry mocks
export {
  createMockTemplateRegistry,
  type MockTemplateRegistryOptions,
  type MockTemplateRegistryReturns,
} from "./mock-template-registry";

// Batch job manager mocks
export {
  createMockBatchJobManager,
  type MockBatchJobManagerOptions,
  type MockBatchJobManagerReturns,
} from "./mock-batch-job-manager";

// Message sender mocks
export { createMockMessageSender } from "./mock-message-sender";

// Fetch mocks
export { mockFetch, type FetchHandler } from "./mock-fetch";

// Test entity fixtures
export { createTestEntity, createTestEntities } from "./fixtures";

// Mock shell
export {
  createMemoryRuntimeStateNamespace,
  createMockShell,
  type MockShell,
  type MockShellOptions,
} from "./mock-shell";

// AppInfo fixture
export { createMockAppInfo } from "./mock-app-info";

// MCP service mock
export { createMockMCPService } from "./mock-mcp-service";

// Isolated file-backed database for one test, with one cleanup contract
export {
  createTestDatabase,
  type ClosableClient,
  type TestDatabase,
  type TestDatabaseOptions,
} from "./test-database";

// Isolated temp directory for one test
export { createTestDirectory, type TestDirectory } from "./test-database";

// Temp directories that remove themselves after the test file
export {
  createTempDir,
  createTempDirSync,
  removeTrackedTempDirs,
} from "./test-database";

// Wait for a condition rather than a guessed duration
export { waitUntil, type WaitUntilOptions } from "./wait-until";

export { spyOnEntityGet, spyOnEntityCreate } from "./spy-on-entity-service";
export { genericSpy } from "./generic-spy";
