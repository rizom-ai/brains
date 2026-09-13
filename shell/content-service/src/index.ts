/**
 * @brains/content-service
 *
 * Content coordination and provider management service for the Brain system.
 * Provides template-based content generation with convenience methods.
 */

export { ContentService } from "./content-service";
export type { ContentServiceDependencies } from "./content-service";
export { planContentGeneration } from "./generation-planner";
export {
  contentGenerationResultSchema,
  type ContentGenerationResult,
  type ContentGenerationResultItem,
} from "./generation-result-contracts";
export {
  submitContentGeneration,
  type GenerationQueueBinding,
} from "./generation-submission";
export {
  MAX_GENERATION_TARGETS,
  MAX_GENERATION_REQUEST_BYTES,
  MAX_GENERATION_JSON_DEPTH,
  GenerationLimitError,
} from "./generation-limits";
export {
  GenerationAuthorizer,
  GenerationAuthorizationError,
  generationAuthoritySchema,
  type GenerationAdmission,
  type GenerationCaller,
  type GenerationAuthority,
  type GenerationAccess,
  type GenerationPrincipal,
} from "./generation-authorization";
export {
  authorizeGenerationWrite,
  type GenerationWriteAuthorizationDependencies,
} from "./generation-write-authorization";
export { scopeTemplateName, unscopeTemplateName } from "./template-scope";
export type { ContentGenerationPlannerDependencies } from "./generation-planner";
export type {
  ContentService as IContentService,
  GenerateContentOptions,
  GenerationContext,
  ContentTemplate,
  ContentTemplateDataSchema,
  ContentTemplateSchemaParser,
  ResolutionOptions,
} from "./types";
export { ContentTemplateSchema } from "./types";

export { ContentGenerationJobHandler } from "./handlers/contentGenerationJobHandler";
export {
  contentGenerationDestinationSchema,
  contentGenerationJobDataSchema,
  contentGenerationOptionsSchema,
  contentGenerationRequestSchema,
  contentGenerationTargetSchema,
  destinationKey,
  persistedContentGenerationDestinationSchema,
  type ContentGenerationBatchResult,
  type ContentGenerationDestination,
  type ContentGenerationDestinationInput,
  type ContentGenerationItemResult,
  type ContentGenerationItemStatus,
  type ContentGenerationJobData,
  type ContentGenerationOptions,
  type ContentGenerationPlan,
  type ContentGenerationRequestInput,
  type ContentGenerationSkipReason,
  type ContentGenerationTarget,
  type ContentGenerationTargetInput,
  type DurableGenerationContext,
  type PersistedContentGenerationDestination,
  type PlannedContentGeneration,
  type SkippedContentGeneration,
} from "./generation-contracts";

// Export templates
export {
  knowledgeQueryTemplate,
  queryResponseTemplate,
  queryResponseSchema,
} from "./templates";
export type { QueryResponse } from "./templates";
