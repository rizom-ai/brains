/**
 * @brains/content-service
 *
 * Content coordination and provider management service for the Brain system.
 * Provides template-based content generation with convenience methods.
 */

export { ContentService } from "./content-service";
export type { ContentServiceDependencies } from "./content-service";
export type {
  ContentService as IContentService,
  GenerationContext,
  ContentTemplate,
  ResolutionOptions,
} from "./types";
export { ContentTemplateSchema } from "./types";

export {
  ContentGenerationJobHandler,
  contentGenerationJobDataSchema,
  type ContentGenerationJobData,
} from "./handlers/contentGenerationJobHandler";

// Export templates
export {
  knowledgeQueryTemplate,
  queryResponseTemplate,
  queryResponseSchema,
} from "./templates";
export type { QueryResponse } from "./templates";
