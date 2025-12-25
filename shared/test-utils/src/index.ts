/**
 * @brains/test-utils
 *
 * Shared test utilities for the brains project.
 * Provides mock builders and helpers to reduce test boilerplate.
 *
 * All mock factories return properly typed objects (Logger, IEntityService, etc.)
 * with the `as unknown as` cast centralized inside the factory function.
 * This means test files don't need any unsafe casts.
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

// Service plugin context mocks
export {
  createMockServicePluginContext,
  type MockServicePluginContextOptions,
  type MockServicePluginContextReturns,
} from "./mock-service-plugin-context";

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

// Message bus mocks
export {
  createMockMessageBus,
  type MockMessageBusOptions,
  type MockMessageBusReturns,
} from "./mock-message-bus";

// Batch job manager mocks
export {
  createMockBatchJobManager,
  type MockBatchJobManagerOptions,
  type MockBatchJobManagerReturns,
} from "./mock-batch-job-manager";
