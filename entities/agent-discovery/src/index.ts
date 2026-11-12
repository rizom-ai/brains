import { z } from "@brains/utils/zod";
import { agentToolsConfigSchema } from "./plugin";

export {
  agentDiscoveryPackage,
  agentToolsConfigSchema,
  agentToolsPackage,
  createAgentDiscoveryPackages,
  derivedSkillPackage,
  skillPackage,
  type AgentDiscoveryPackages,
  type AgentToolsConfig,
  type AgentToolsConfigInput,
} from "./plugin";
export { agentEntity } from "./agent-entity";
export { derivedSkill, skill } from "./skill-entity";
export type { AgentNetwork } from "./lib/agent-context";
export {
  agentFromMarkdown,
  createAgentContent,
  createSkillContent,
  parseAgentEntity,
  rewriteAgentContent,
  type CreateAgentContentInput,
  type ParsedAgent,
} from "./lib/agent-content";

/** Composite config for the agent-discovery feature. */
export const agentDiscoveryCompositeConfigSchema: z.ZodType<
  { notifyOnNewAgents: boolean; enableSkillDerivation: boolean },
  {
    notifyOnNewAgents?: boolean | undefined;
    enableSkillDerivation?: boolean | undefined;
  }
> = agentToolsConfigSchema.extend({
  enableSkillDerivation: z
    .boolean()
    .default(true)
    .describe("Derive skills from topic and agent evidence using AI"),
});

export type AgentDiscoveryCompositeConfig = z.output<
  typeof agentDiscoveryCompositeConfigSchema
>;
export type AgentDiscoveryCompositeConfigInput = z.input<
  typeof agentDiscoveryCompositeConfigSchema
>;

export {
  agentEntitySchema,
  agentFrontmatterSchema,
  agentMetadataSchema,
  agentSkillSchema,
  agentWithDataSchema,
  enrichedAgentSchema,
  templateAgentSchema,
  type AgentEntity,
  type AgentFrontmatter,
  type AgentMetadata,
  type AgentSkill,
  type AgentWithData,
  type EnrichedAgent,
  type TemplateAgent,
} from "./schemas/agent";

export { AgentProximityMapTemplate } from "./templates/proximity-map-template";
export { ProximityMap, proximityMapScript } from "./widgets/proximity-map";
export {
  proximityMapDataSchema,
  type ProximityMapCenter,
  type ProximityMapCluster,
  type ProximityMapClusterLink,
  type ProximityMapData,
  type ProximityMapDistanceRange,
  type ProximityMapNode,
  type ProximityMapSighting,
} from "./lib/proximity-map-schema";

export {
  normalizeTag,
  normalizeTags,
  type TagVocabularyEntry,
} from "./lib/tag-vocabulary";

export {
  skillFrontmatterSchema,
  skillMetadataSchema,
  skillEntitySchema,
  type SkillFrontmatter,
  type SkillMetadata,
  type SkillEntity,
} from "./schemas/skill";
