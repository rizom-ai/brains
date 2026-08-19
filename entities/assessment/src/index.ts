/**
 * Assessment package.
 *
 * One entity: a SWOT analysis of the brain's own capabilities, derived from
 * agents and skills by a projection rule.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { swot } from "./swot-entity";

const assessmentPackage: EntityPackageDefinition<
  readonly [typeof swot],
  readonly []
> = defineEntityPackage({ id: "assessment", entities: [swot] });

export default assessmentPackage;

export { swot } from "./swot-entity";
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
