import type { SiteContentPreview, SiteContentProduction } from "../types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";

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
 * Interface for tracking async content generation jobs
 */
export interface SiteContentJob {
  jobId: string;
  route: RouteDefinition;
  section: SectionDefinition;
  templateName: string;
  targetEntityType: "site-content-preview" | "site-content-production";
  page: string;
  sectionId: string;
}

/**
 * Summary of job statuses for async operations
 */
export interface JobStatusSummary {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  jobs: Array<{
    jobId: string;
    sectionId: string;
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  }>;
}
