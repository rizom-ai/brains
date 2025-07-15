import type { BaseEntity } from "@brains/types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";

// Re-export types from schemas
export type {
  ContentEnvironment,
  GenerateOptions,
  GenerateResult,
} from "./schemas";

// Re-export schemas
export {
  ContentEnvironmentSchema,
  GenerateOptionsSchema,
  GenerateResultSchema,
} from "./schemas";

/**
 * Generic site content entity interface
 */
export interface SiteContentEntity extends BaseEntity {
  routeId: string;
  sectionId: string;
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
  routeId: string;
  sectionId: string;
}

/**
 * Interface for tracking async content generation jobs
 * These operations require AI generation with route/section context
 */
export interface ContentGenerationJob {
  jobId: string;
  entityId: string;
  entityType: "site-content-preview" | "site-content-production";
  operation: "generate";
  routeId: string;
  sectionId: string;
  templateName: string;
  route: RouteDefinition;
  sectionDefinition: SectionDefinition;
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

// Re-export utility types
export type { ContentComparison } from "./utils/comparator";
