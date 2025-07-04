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
  RegenerateOptions,
  RegenerateResult,
  ContentGenerationJob,
  DeriveOptions,
  DeriveResult,
} from "./types";

// Job tracking types
export type {
  ProgressCallback,
  ContentGenerationResult,
} from "./services/job-tracking";
