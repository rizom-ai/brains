import type { Plugin } from "@brains/plugins";
import {
  assessmentConfigSchema,
  swotAssessmentPlugin,
  type AssessmentConfigInput,
} from "./plugin";

export {
  SwotAssessmentPlugin,
  assessmentConfigSchema,
  swotAssessmentPlugin,
  type AssessmentConfig,
  type AssessmentConfigInput,
} from "./plugin";
export { createSwotEvalPlugin } from "./eval/swot-eval-plugin";

export function assessment(config: AssessmentConfigInput = {}): Plugin[] {
  return [swotAssessmentPlugin(assessmentConfigSchema.parse(config))];
}

export { SwotAdapter, swotAdapter } from "./adapters/swot-adapter";
export {
  buildCapabilityProfiles,
  buildCapabilityProfilesFromEntities,
  type CapabilityProfile,
  type CapabilityProfileSkill,
} from "./lib/capability-profile";
export {
  buildSwotContext,
  buildSwotContextFromEntities,
  buildSwotContextFromProfiles,
  type SwotContext,
  type SwotContextAgent,
  type SwotContextSkill,
} from "./lib/swot-context";
export {
  swotItemSchema,
  swotFrontmatterSchema,
  swotMetadataSchema,
  swotEntitySchema,
  type SwotItem,
  type SwotFrontmatter,
  type SwotMetadata,
  type SwotEntity,
} from "./schemas/swot";
export {
  swotDerivationJobSchema,
  swotGenerationSchema,
  type SwotDerivationJobData,
  type SwotGeneration,
} from "./schemas/swot-generation";
