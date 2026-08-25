export {
  agentDiscovery,
  agentDiscoveryConfigSchema,
  type AgentDiscoveryConfig,
  type AgentDiscoveryConfigInput,
} from "./agent-discovery";
export { agent } from "./agent-entity";
export { skill } from "./skill-entity";
export { default } from "./agent-discovery";

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
