import type {
  SiteContent,
  SiteContentEntityType,
} from "@brains/types";
import type {
  RouteDefinition,
  SectionDefinition,
} from "@brains/view-registry";

// Re-export types from schemas
export type {
  RegenerateMode,
  ContentEnvironment,
  RegenerateOptions,
  RegenerateResult,
  GenerateOptions,
  GenerateResult,
} from "./schemas";

// Re-export schemas
export {
  RegenerateModeSchema,
  ContentEnvironmentSchema,
  RegenerateOptionsSchema,
  RegenerateResultSchema,
  GenerateOptionsSchema,
  GenerateResultSchema,
} from "./schemas";

// Re-export shared types
export type {
  SiteContent,
  RouteDefinition,
  SectionDefinition,
  SiteContentEntityType,
};

/**
 * Interface for tracking async content generation jobs
 */
export interface SiteContentJob {
  jobId: string;
  route: RouteDefinition;
  section: SectionDefinition;
  templateName: string;
  targetEntityType: "site-content-preview" | "site-content-production";
  pageId: string;
  sectionId: string;
}

/**
 * Interface for tracking async content generation jobs (generate/regenerate)
 * These operations require AI generation with route/section context
 */
export interface ContentGenerationJob {
  jobId: string;
  entityId: string;
  entityType: "site-content-preview" | "site-content-production";
  operation: "generate" | "regenerate";
  pageId: string;
  sectionId: string;
  templateName: string;
  route: RouteDefinition;
  sectionDefinition: SectionDefinition;
  mode?: "leave" | "new" | "with-current"; // For regenerate only
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
