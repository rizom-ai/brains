export const AGENT_ENTITY_TYPE = "agent";
export const AGENT_DISCOVERY_PLUGIN_ID = "agent-discovery";
export const AGENT_GENERATION_JOB_TYPE = "agent:generation";
export const AGENT_NETWORK_WIDGET_ID = "agent-network";
export const AGENT_PROXIMITY_WIDGET_ID = "agent-proximity";
// Local, not scoped: the runtime prefixes a declared data source with the
// plugin it belongs to, and a template naming it does the same.
export const AGENT_DATASOURCE_ID = "entities";
// Local, like the entity data source: the runtime prefixes it with the
// plugin, and a template naming it writes the same local name.
export const AGENT_PROXIMITY_DATASOURCE_ID = "proximity-map";
export const AGENT_PROXIMITY_TEMPLATE_NAME = "proximity-map";
export const AGENT_LIST_TEMPLATE_NAME = "agent-list";
export const AGENT_DETAIL_TEMPLATE_NAME = "agent-detail";

export const SKILL_ENTITY_TYPE = "skill";
export const MAX_SKILL_TAGS = 30;
export const MAX_SKILL_TAG_LENGTH = 120;
export const SKILL_PLUGIN_ID = "skill";
export const SKILL_DERIVATION_PROJECTION_ID = "skill-derivation";
export const SKILL_DERIVATION_TEMPLATE_NAME = "skill-derivation";
export const SKILL_DERIVATION_TEMPLATE_REF: string = `${SKILL_PLUGIN_ID}:${SKILL_DERIVATION_TEMPLATE_NAME}`;
export const SKILLS_WIDGET_ID = "skills";
