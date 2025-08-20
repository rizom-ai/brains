/**
 * Personal Brain Utils Package
 *
 * This package contains shared utilities used across the Personal Brain system.
 */

// Logger
export { Logger, LogLevel } from "./logger";
export { default as defaultLogger } from "./logger";

// Test utilities
export { createSilentLogger, createTestLogger } from "./test-utils";

// Markdown utilities
export {
  parseMarkdown,
  extractTitle,
  extractIndexedFields,
  generateMarkdown,
  markdownToHtml,
  stripMarkdown,
} from "./markdown";

// Progress utilities
export { ProgressReporter } from "./progress";
export type {
  ProgressCallback,
  ProgressNotification,
  IJobProgressMonitor,
} from "./progress";

// YAML utilities
export { toYaml, fromYaml, isValidYaml } from "./yaml";

// Formatters
export * from "./formatters";

// ID generation utilities
export { createId, createPrefixedId, createBatchId } from "./id";

// String utilities
export { slugify, generateIdFromText } from "./string-utils";

// Error message utilities
export {
  registrationError,
  duplicateRegistrationError,
  notFoundError,
  validationError,
  initializationError,
} from "./errors";

// Response types
export {
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
  type DefaultQueryResponse,
  type SimpleTextResponse,
  type CreateEntityResponse,
  type UpdateEntityResponse,
} from "./response-types";
