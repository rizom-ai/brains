/**
 * @brains/test-utils
 *
 * Shared test utilities for the brains project.
 * Provides mock builders and helpers to reduce test boilerplate.
 *
 * Every factory is declared against the interface it stands in for, so
 * interface drift fails to compile here rather than leaving a silently stale
 * mock. Test files need no casts of their own.
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
export { createTestEntityAccess } from "./entity-access";
export { createTestAppInfo } from "./app-info";
export {
  createStubAuth,
  createTestPrincipal,
  type StubAuthOptions,
} from "./stub-auth";
export { createTestJobContext } from "./job-context";
export { fetchable, type FetchableDataSource } from "./fetchable-data-source";

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
export {
  createMockMessageSender,
  createMockMessagePublisher,
} from "./mock-message-sender";

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
export { ProcessExited, expectProcessExit } from "./process-exit";

// Check a caught value is an Error rather than asserting it into one
export { caughtError } from "./caught-error";

// A working adapter for a type a test only needs registered
export {
  createTestEntityAdapter,
  type TestEntityAdapterOptions,
} from "./test-entity-adapter";

// Narrow a tool result to a branch of ToolResponse by parsing, not asserting
export {
  expectToolSuccess,
  expectToolError,
  expectToolConfirmation,
  expectConfirmationArgs,
} from "./tool-response";

// Semantic renderer-output comparison
export {
  normalizeRendererHtml,
  type NormalizedHtmlNode,
  type NormalizeRendererHtmlOptions,
} from "./html-equivalence";
