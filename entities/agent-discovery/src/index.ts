import type { Plugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { agentDiscoveryPlugin } from "./plugin";
import { skillPlugin } from "./plugins/skill-plugin";

export { AgentDiscoveryPlugin, agentDiscoveryPlugin } from "./plugin";

/**
 * Composite config for the agent-discovery feature.
 *
 * Currently no shared options — the schema is empty but exists so brain.yaml
 * can target the composite by id and so future shared config (e.g. a card
 * cache TTL or discovery toggle) lands without breaking the API.
 */
export const agentDiscoveryCompositeConfigSchema = z.object({}).passthrough();

export type AgentDiscoveryCompositeConfig = z.infer<
  typeof agentDiscoveryCompositeConfigSchema
>;

/**
 * Composite factory: returns the agent entity plugin + skill entity plugin
 * from a single capability entry.
 *
 * Use as a capability factory in `defineBrain()`:
 *
 * ```ts
 * capabilities: [
 *   ["agent-discovery", agentDiscovery, undefined],
 * ]
 * ```
 *
 * Both sub-plugins are gated by the composite's `agent-discovery` capability
 * id — add or remove the composite from a preset to enable or disable both.
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

// Skill entity
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
