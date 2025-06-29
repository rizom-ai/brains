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
} from "./markdown";

// Frontmatter utilities
export {
  extractMetadata,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  shouldIncludeInFrontmatter,
  deserializeMetadata,
  type FrontmatterConfig,
} from "./frontmatter";

// Progress utilities
export { ProgressReporter } from "./progress";
export type { ProgressCallback, ProgressNotification } from "./progress";

// YAML utilities
export { toYaml, fromYaml, isValidYaml } from "./yaml";

// Error utilities
export {
  type ErrorCause,
  BrainsError,
  InitializationError,
  DatabaseError,
  ConfigurationError,
  PluginError,
  PluginRegistrationError,
  PluginDependencyError,
  PluginInitializationError,
  ServiceError,
  ServiceRegistrationError,
  ServiceResolutionError,
  ContentGenerationError,
  TemplateRegistrationError,
  RouteRegistrationError,
  McpError,
  ToolRegistrationError,
  ResourceRegistrationError,
  EntityRegistrationError,
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
