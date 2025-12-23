/**
 * @brains/test-utils
 *
 * Shared test utilities for the brains project.
 * Provides mock builders and helpers to reduce test boilerplate.
 */

// Logger utilities
export {
  createSilentLogger,
  createTestLogger,
  createMockLogger,
  type MockLogger,
} from "./mock-logger";

// Entity service mocks
export {
  createMockEntityService,
  asMockEntityService,
  type MockEntityService,
  type MockEntityServiceOptions,
} from "./mock-entity-service";

// Progress reporter mocks
export {
  createMockProgressReporter,
  asMockProgressReporter,
  type MockProgressReporter,
} from "./mock-progress-reporter";

// Service plugin context mocks
export {
  createMockServicePluginContext,
  asMockServicePluginContext,
  type MockServicePluginContext,
  type MockServicePluginContextOptions,
} from "./mock-service-plugin-context";
