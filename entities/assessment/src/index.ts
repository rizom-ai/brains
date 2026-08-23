/**
 * Assessment package.
 *
 * One entity: a SWOT analysis of the brain's own capabilities, derived from
 * agents and skills by a projection rule.
 */

import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { assessmentConfigSchema } from "./schemas/config";
import { createSwotProjectionRule } from "./lib/swot-projection";
import { swot } from "./swot-entity";

const assessmentPackage: ServicePackageDefinition<
  typeof assessmentConfigSchema
> = defineServicePlugin({
  id: "assessment",
  config: assessmentConfigSchema,
  entities: [swot],
  // Whether the rule exists at all is a configured question, so it is a
  // function of config rather than static entity data.
  projectionRules: ({ config }) =>
    config.enableSwotDerivation ? [createSwotProjectionRule()] : [],
});

export default assessmentPackage;

export { swot } from "./swot-entity";
export {
  assessmentConfigSchema,
  type AssessmentConfig,
  type AssessmentConfigInput,
} from "./schemas/config";
export { swotWidget } from "./widgets/swot";
export {
  createSwotProjectionRule,
  deriveSwotIntent,
} from "./lib/swot-projection";
export { buildCapabilityProfilesFromEntities } from "./lib/capability-profile";
export {
  buildSwotContextFromEntities,
  buildSwotContextFromProfiles,
  type SwotContext,
} from "./lib/swot-context";
export type {
  CapabilityProfile,
  CapabilityProfileSkill,
} from "./lib/capability-profile";
export { swotAdapter, SwotAdapter } from "./adapters/swot-adapter";
export type { SwotEntity, SwotFrontmatter, SwotMetadata } from "./schemas/swot";
export { swotFrontmatterSchema, swotMetadataSchema } from "./schemas/swot";
