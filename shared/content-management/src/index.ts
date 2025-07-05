/**
 * Content Management Package
 *
 * Shared package for content generation, querying, and job tracking operations.
 * Extracted from site-builder plugin for reuse across multiple plugins.
 */

// Main facade class
export { ContentManager } from "./manager";

// Core operation classes
export { GenerationOperations } from "./operations/generation";
export { DerivationOperations } from "./operations/derivation";
export { EntityQueryService } from "./services/entity-query";
export { JobTrackingService } from "./services/job-tracking";

// Types and interfaces
export type {
  SiteContent,
  SiteContentEntityType,
  GenerateOptions,
  GenerateResult,
  ContentGenerationJob,
  DeriveOptions,
  DeriveResult,
  ContentComparison,
} from "./types";

// Schemas for validation
export {
  GenerateOptionsSchema,
  GenerateResultSchema,
  ContentEnvironmentSchema,
} from "./schemas";

// Job tracking types
export type {
  ProgressCallback,
  ContentGenerationResult,
} from "./services/job-tracking";

// Utility functions
export {
  waitForContentJobs,
  getContentJobStatuses,
} from "./utils/job-tracking";

// Content utilities
export {
  generateSiteContentId,
  parseSiteContentId,
  convertSiteContentId,
  previewToProductionId,
  productionToPreviewId,
} from "./utils/id-generator";

export { compareContent, isContentEquivalent } from "./utils/comparator";
