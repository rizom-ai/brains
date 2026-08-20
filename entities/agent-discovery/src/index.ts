import type { Plugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { agentDiscoveryPlugin } from "./plugins/agent-plugin";
import {
  agentToolsConfigSchema,
  agentToolsPlugin,
} from "./plugins/agent-tools-plugin";
import { skillPlugin } from "./plugins/skill-plugin";

export {
  AgentDiscoveryPlugin,
  agentDiscoveryPlugin,
} from "./plugins/agent-plugin";
export {
  AgentToolsPlugin,
  agentToolsConfigSchema,
  agentToolsPlugin,
  type AgentToolsConfig,
  type AgentToolsConfigInput,
} from "./plugins/agent-tools-plugin";

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

/**
 * Composite factory: returns the agent and skill entity plugins from a single
 * capability entry.
 *
 * Assessment/SWOT is intentionally separate. Add `assessment` as its own
 * capability when the brain should derive assessment outputs from the
 * agent/skill evidence.
 */
export function agentDiscovery(
  config: AgentDiscoveryCompositeConfigInput = {},
): Plugin[] {
  const { enableSkillDerivation, ...agentToolsConfig } =
    agentDiscoveryCompositeConfigSchema.parse(config);
  return [
    agentDiscoveryPlugin(),
    agentToolsPlugin(agentToolsConfig),
    skillPlugin({ enableSkillDerivation }),
  ];
}

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

export { AgentAdapter } from "./adapters/agent-adapter";
export { AgentDataSource } from "./datasources/agent-datasource";
export { ProximityMapDataSource } from "./datasources/proximity-map-datasource";
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
  SkillPlugin,
  skillPlugin,
  skillPluginConfigSchema,
  type SkillPluginConfig,
  type SkillPluginConfigInput,
} from "./plugins/skill-plugin";

export {
  skillFrontmatterSchema,
  skillMetadataSchema,
  skillEntitySchema,
  type SkillFrontmatter,
  type SkillMetadata,
  type SkillEntity,
} from "./schemas/skill";

export { SkillAdapter } from "./adapters/skill-adapter";
