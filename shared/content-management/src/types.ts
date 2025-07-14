import type { SiteContentEntityType } from "@brains/types";
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

// Re-export shared types
export type { RouteDefinition, SectionDefinition, SiteContentEntityType };

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

/**
 * Options for content derivation operations
 */
export interface DeriveOptions {
  /** Whether to delete the source entity after successful derivation */
  deleteSource?: boolean;
}

/**
 * Result of a content derivation operation
 */
export interface DeriveResult {
  /** ID of the source entity */
  sourceEntityId: string;
  /** Type of the source entity */
  sourceEntityType: SiteContentEntityType;
  /** ID of the newly created derived entity */
  derivedEntityId: string;
  /** Type of the derived entity */
  derivedEntityType: SiteContentEntityType;
  /** Whether the source entity was deleted */
  sourceDeleted: boolean;
}

// Re-export utility types
export type { ContentComparison } from "./utils/comparator";
