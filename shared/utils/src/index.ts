/**
 * Brains Utils Package
 *
 * This package contains shared utilities used across the Brains system.
 */

// Database config
export { dbConfigSchema, type DbConfig } from "./db-config";

// Logger
export { Logger, LogLevel } from "./logger";
export type { LogFormat, LoggerOptions } from "./logger";
export { default as defaultLogger } from "./logger";

// Markdown utilities
export {
  parseMarkdown,
  extractTitle,
  extractIndexedFields,
  generateMarkdown,
  markdownToHtml,
  stripMarkdown,
  extractMarkdownImages,
  updateFrontmatterField,
  getCoverImageId,
  setCoverImageId,
} from "./markdown";
export type {
  ExtractedImage,
  ImageRenderer,
  MarkdownToHtmlOptions,
} from "./markdown";

// Concurrency
export { default as pLimit } from "p-limit";

// Progress utilities
export { ProgressReporter } from "./progress";
export type {
  ProgressCallback,
  ProgressNotification,
  IJobProgressMonitor,
} from "./progress";

// YAML utilities
export { toYaml, fromYaml, isValidYaml, parseYamlDocument } from "./yaml";

// Formatters
export * from "./formatters";

// ID generation utilities
export { createId, createPrefixedId, createBatchId } from "./id";

// String utilities
export {
  slugify,
  slugifyUrl,
  generateIdFromText,
  pluralize,
  toDisplayName,
  displayLinkLabel,
  resolveUrl,
  formatLabel,
  calculateReadingTime,
  firstSentence,
  truncateText,
  derivePreviewDomain,
  interpolateEnvVar,
  interpolateEnv,
} from "./string-utils";

// Array utilities
export { ensureArray } from "./array";

// Message chunking
export { chunkMessage } from "./chunk-message";

// URL generation utilities
export { EntityUrlGenerator } from "./entity-url-generator";
export type { EntityDisplayMap } from "./entity-url-generator";

// Hash utilities — import from "@brains/utils/hash" (uses Node crypto)

// Sort utilities
export { sortByPublicationDate } from "./sort";

// Date utilities
export { toISODateString, getYesterday, getDaysAgo } from "./date";

// HTTP utilities
export {
  isHttpUrl,
  fetchAsBase64DataUrl,
  fetchImageAsBase64,
  fetchAsText,
} from "./http-utils";

// Zod exports - centralized for the entire monorepo
// NOTE: No wildcard exports to avoid loading all Zod types (causes 5M+ type instantiations)
export { z, ZodError } from "./zod";
export type { ZodType, ZodSchema } from "./zod";

// Additional Zod type exports
export type {
  ZodRawShape,
  ZodInfer,
  ZodInput,
  ZodOutput,
  ZodTypeAny,
} from "./zod";

// Error utilities
export { getErrorMessage, toError } from "./error";

// Debounce utilities
export { LeadingTrailingDebounce } from "./debounce";

// HTTP response helpers
export { readJsonBody, parseJsonResponse } from "./http-response";

// Presentation utilities
export {
  parseSlideDirectives,
  splitColumns,
  type SlideDirectiveResult,
} from "./slide-directives";
export { convertMermaidBlocks, escapeHtml } from "./presentation-html";
