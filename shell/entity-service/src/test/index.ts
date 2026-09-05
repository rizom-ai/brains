/**
 * Test doubles for this package's own interfaces.
 *
 * A package owns the mock of what it defines: a shared test-utils package
 * that mocked every service would have to depend on every service, and the
 * tests importing it back would close a loop turbo cannot schedule.
 */
export { createTestEntity, createTestEntities } from "./fixtures";
export {
  createMockDataSourceRegistry,
  type MockDataSourceRegistryOptions,
  type MockDataSourceRegistryReturns,
} from "./mock-datasource-registry";
export {
  createMockEntityService,
  type MockEntityServiceOptions,
  type MockEntityServiceReturns,
} from "./mock-entity-service";
export { spyOnEntityCreate, spyOnEntityGet } from "./spy-on-entity-service";
export {
  createTestEntityAdapter,
  type TestEntityAdapterOptions,
} from "./test-entity-adapter";
