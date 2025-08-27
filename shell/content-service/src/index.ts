/**
 * @brains/content-service
 *
 * Content coordination and provider management service for the Brain system.
 * Provides template-based content generation with convenience methods.
 */

export { ContentService } from "./content-service";
export type {
  ContentServiceDependencies,
  ProgressInfo,
} from "./content-service";
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
export {
  ContentDerivationJobHandler,
  contentDerivationJobDataSchema,
  type ContentDerivationJobData,
} from "./handlers/contentDerivationJobHandler";
