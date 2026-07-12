import type { Plugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { swotAssessmentPlugin } from "./plugin";

export { SwotAssessmentPlugin, swotAssessmentPlugin } from "./plugin";
export { createSwotEvalPlugin } from "./eval/swot-eval-plugin";

export type AssessmentConfig = Record<string, never>;
export type AssessmentConfigInput = Record<string, never>;

export const assessmentConfigSchema: z.ZodType<
  AssessmentConfig,
  AssessmentConfigInput
> = z.object({}).strict();

export function assessment(config: unknown = {}): Plugin[] {
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
