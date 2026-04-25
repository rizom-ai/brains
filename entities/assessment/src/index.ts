import type { Plugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { swotAssessmentPlugin } from "./plugin";

export { SwotAssessmentPlugin, swotAssessmentPlugin } from "./plugin";
export { createSwotEvalPlugin } from "./eval/swot-eval-plugin";

export const assessmentConfigSchema = z.object({}).strict();
export type AssessmentConfig = z.infer<typeof assessmentConfigSchema>;

export function assessment(config: AssessmentConfig = {}): Plugin[] {
  assessmentConfigSchema.parse(config);
  return [swotAssessmentPlugin()];
}

export { SwotAdapter, swotAdapter } from "./adapters/swot-adapter";
export { SwotWidget } from "./widgets/swot-widget";
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
  swotDerivationJobSchema,
  swotGenerationSchema,
  type SwotItem,
  type SwotFrontmatter,
  type SwotMetadata,
  type SwotEntity,
  type SwotDerivationJobData,
  type SwotGeneration,
} from "./schemas/swot";
