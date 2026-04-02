export { AgentDiscoveryPlugin, agentDiscoveryPlugin } from "./plugin";

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
