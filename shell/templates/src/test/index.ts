/**
 * Test doubles for this package's own interfaces.
 *
 * A package owns the mock of what it defines: a shared test-utils package
 * that mocked every service would have to depend on every service, and the
 * tests importing it back would close a loop turbo cannot schedule.
 */
export {
  createMockTemplateRegistry,
  type MockTemplateRegistryOptions,
  type MockTemplateRegistryReturns,
} from "./mock-template-registry";
