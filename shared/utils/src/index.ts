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

// Error utilities
export {
  type ErrorCause,
  BrainsError,
  InitializationError,
  DatabaseError,
  ConfigurationError,
  ServiceError,
  ServiceRegistrationError,
  ServiceResolutionError,
  ContentGenerationError,
  TemplateNotGeneratableError,
  TemplateRegistrationError,
  RouteRegistrationError,
  McpError,
  ToolRegistrationError,
  ResourceRegistrationError,
  EntityRegistrationError,
  JobHandlerRegistrationError,
  DaemonRegistrationError,
  JobOperationError,
  ErrorUtils,
  normalizeError,
} from "./errors";

// Content validation utilities
export {
  ContentValidator,
  ContentValidationError,
  SchemaNotFoundError,
} from "./content-validator";

// Formatters
export * from "./formatters";

// Permission handling
export {
  PermissionHandler,
  UserPermissionLevelSchema,
  type UserPermissionLevel,
} from "./permission-handler";

// ID generation utilities
export { createId, createPrefixedId, createBatchId } from "./id";
