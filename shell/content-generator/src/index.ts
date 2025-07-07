/**
 * @brains/content-generator
 *
 * Content generation utilities for the Brain system.
 * Provides template-based content generation with convenience methods.
 */

export { ContentGenerator } from "./content-generator";
export type {
  ContentGeneratorDependencies,
  ProgressInfo,
} from "./content-generator";
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
