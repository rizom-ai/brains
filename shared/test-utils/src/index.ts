/**
 * @brains/test-utils
 *
 * Cross-cutting test helpers: loggers, temp directories, spies, and the
 * waiting and comparison primitives every package's tests reach for.
 *
 * Nothing here depends on a shell service. A package owns the mock of what it
 * defines — `@brains/entity-service/test` mocks the entity service, and so on
 * — because a shared package that mocked every service would have to depend on
 * every service, and the tests importing it back would close a loop turbo
 * cannot schedule.
 */

// Logger utilities
export {
  createSilentLogger,
  createTestLogger,
  createMockLogger,
} from "./mock-logger";

// Progress reporter mocks
export { createMockProgressReporter } from "./mock-progress-reporter";

// Message sender mocks
export {
  createMockMessageSender,
  createMockMessagePublisher,
} from "./mock-message-sender";

// Fetch mocks

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

export { genericSpy } from "./generic-spy";
export { spyOnMembers, type SpiedMembers } from "./spy-on-members";
export { ProcessExited, expectProcessExit } from "./process-exit";

// Check a caught value is an Error rather than asserting it into one
export { caughtError } from "./caught-error";

// Semantic renderer-output comparison
export {
  normalizeRendererHtml,
  type NormalizedHtmlNode,
  type NormalizeRendererHtmlOptions,
} from "./html-equivalence";
