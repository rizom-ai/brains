import type { Plugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { agentDiscoveryPlugin } from "./plugin";
import { skillPlugin } from "./plugins/skill-plugin";

export { AgentDiscoveryPlugin, agentDiscoveryPlugin } from "./plugin";

/**
 * Composite config for the agent-discovery feature.
 *
 * Currently no shared options — the schema is empty but strict so any
 * unrecognized brain.yaml override surfaces as a ZodError instead of being
 * silently dropped. Add fields here when shared config (e.g. a card cache TTL
 * or discovery toggle) is introduced.
 */
export const agentDiscoveryCompositeConfigSchema = z.object({}).strict();

export type AgentDiscoveryCompositeConfig = z.infer<
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
  config: AgentDiscoveryCompositeConfig = {},
): Plugin[] {
  agentDiscoveryCompositeConfigSchema.parse(config);
  return [agentDiscoveryPlugin(), skillPlugin()];
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
export {
  AgentNetworkWidget,
  agentNetworkWidgetScript,
} from "./widgets/agent-network-widget";

export {
  normalizeTag,
  normalizeTags,
  type TagVocabularyEntry,
} from "./lib/tag-vocabulary";

export { SkillPlugin, skillPlugin } from "./plugins/skill-plugin";

export {
  skillFrontmatterSchema,
  skillMetadataSchema,
  skillEntitySchema,
  type SkillFrontmatter,
  type SkillMetadata,
  type SkillEntity,
} from "./schemas/skill";

export { SkillAdapter } from "./adapters/skill-adapter";
