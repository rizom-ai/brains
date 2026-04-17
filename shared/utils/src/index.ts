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
  formatLabel,
  calculateReadingTime,
  truncateText,
  derivePreviewDomain,
  interpolateEnvVar,
  interpolateEnv,
} from "./string-utils";

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
export {
  generationResultSchema,
  type GenerationResult,
} from "./generation-result";

// Error utilities
export { getErrorMessage, toError } from "./error";

// Debounce utilities
export { LeadingTrailingDebounce } from "./debounce";

// CI / workflow helpers
export {
  readJsonResponse,
  parseEnvFile,
  parseEnvSchema,
  parseEnvSchemaFile,
  requireEnv,
  writeGitHubOutput,
  writeGitHubEnv,
} from "./ci";
export type { EnvSchemaEntry } from "./ci";
export {
  readLocalEnvValues,
  resolveLocalEnvValue,
  resolveLocalPath,
} from "./local-env";
export { readJsonBody, parseJsonResponse } from "./http-response";

// Presentation utilities
export {
  parseSlideDirectives,
  splitColumns,
  type SlideDirectiveResult,
} from "./slide-directives";
export { convertMermaidBlocks } from "./presentation-html";
