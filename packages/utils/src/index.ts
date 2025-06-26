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
export type { ProgressCallback } from "./progress";

// Plugin utilities
export * from "./plugin";

// YAML utilities
export { toYaml, fromYaml, isValidYaml } from "./yaml";
