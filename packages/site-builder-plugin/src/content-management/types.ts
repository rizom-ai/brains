import type { SiteContentPreview, SiteContentProduction } from "@brains/types";

// Re-export types from schemas
export type {
  RegenerateMode,
  ContentEnvironment,
  PromoteOptions,
  PromoteResult,
  RollbackOptions,
  RollbackResult,
  RegenerateOptions,
  RegenerateResult,
  ContentComparison,
} from "./schemas";

// Re-export schemas
export {
  RegenerateModeSchema,
  ContentEnvironmentSchema,
  PromoteOptionsSchema,
  PromoteResultSchema,
  RollbackOptionsSchema,
  RollbackResultSchema,
  RegenerateOptionsSchema,
  RegenerateResultSchema,
  ContentComparisonSchema,
} from "./schemas";

/**
 * Unified type for both preview and production site content
 */
export type SiteContent = SiteContentPreview | SiteContentProduction;

/**
 * Type guards for safe discrimination between preview and production content
 */
export function isPreviewContent(content: SiteContent): content is SiteContentPreview {
  return content.entityType === "site-content-preview";
}

export function isProductionContent(content: SiteContent): content is SiteContentProduction {
  return content.entityType === "site-content-production";
}