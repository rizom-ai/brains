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
