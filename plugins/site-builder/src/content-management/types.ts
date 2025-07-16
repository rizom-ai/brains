import type { SiteContentPreview, SiteContentProduction } from "../types";

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
  GenerateOptions,
  GenerateResult,
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
  GenerateOptionsSchema,
  GenerateResultSchema,
  ContentComparisonSchema,
} from "./schemas";

/**
 * Unified type for both preview and production site content
 */
export type SiteContent = SiteContentPreview | SiteContentProduction;

/**
 * Type guards for safe discrimination between preview and production content
 */
export function isPreviewContent(
  content: SiteContent,
): content is SiteContentPreview {
  return content.entityType === "site-content-preview";
}

export function isProductionContent(
  content: SiteContent,
): content is SiteContentProduction {
  return content.entityType === "site-content-production";
}

/**
 * Interface for tracking async entity operation jobs (promote/rollback)
 * These operations work on existing entities without AI generation
 */
export interface EntityOperationJob {
  jobId: string;
  entityId: string;
  targetEntityId?: string; // For promote operations (production entity ID)
  entityType: "site-content-preview" | "site-content-production";
  operation: "promote" | "rollback";
  routeId: string;
  sectionId: string;
}
