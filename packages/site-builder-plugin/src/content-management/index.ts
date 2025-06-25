/**
 * Site Content Management Module
 * 
 * Provides comprehensive content lifecycle management for site content entities,
 * including promotion from preview to production, rollback, and regeneration.
 */

// Export the main manager class
export { SiteContentManager } from "./manager";

// Export public types
export type {
  SiteContent,
  PromoteOptions,
  PromoteResult,
  RollbackOptions,
  RollbackResult,
  RegenerateOptions,
  RegenerateResult,
  ContentComparison,
} from "./types";

// Export schemas for validation
export {
  PromoteOptionsSchema,
  RollbackOptionsSchema,
  RegenerateOptionsSchema,
} from "./schemas";

// Export type guards (useful for consumers)
export { isPreviewContent, isProductionContent } from "./types";