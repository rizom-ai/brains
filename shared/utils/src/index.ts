/**
 * Personal Brain Utils Package
 *
 * This package contains shared utilities used across the Personal Brain system.
 */

// Logger
export { Logger, LogLevel } from "./logger";
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
export type { ExtractedImage } from "./markdown";

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
export {
  slugify,
  generateIdFromText,
  pluralize,
  calculateReadingTime,
  truncateText,
} from "./string-utils";

// URL generation utilities
export { EntityUrlGenerator } from "./entity-url-generator";
export type { EntityRouteConfig } from "./entity-url-generator";

// Hash utilities
export { computeContentHash } from "./hash";

// Sort utilities
export { sortByPublicationDate } from "./sort";

// Date utilities
export { toISODateString, getYesterday, getDaysAgo } from "./date";

// HTTP utilities
export {
  isHttpUrl,
  fetchAsBase64DataUrl,
  fetchImageAsBase64,
} from "./http-utils";

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

// Publish types - shared between publish-pipeline and content plugins
export type {
  PublishResult,
  PublishProvider,
  PublishImageData,
} from "./publish-types";

// Job handler utilities
export { PROGRESS_STEPS, type ProgressStep } from "./progress-steps";
export { JobResult } from "./job-result";

// Debounce utilities
export { LeadingTrailingDebounce } from "./debounce";
