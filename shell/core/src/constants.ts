/**
 * Shell core entity type constants
 * Use these instead of hardcoded strings to prevent typos
 */
export const SHELL_ENTITY_TYPES = {
  BASE: "base",
  IDENTITY: "identity",
  PROFILE: "profile",
  IMAGE: "image",
} as const;

/**
 * Shell core template name constants
 */
export const SHELL_TEMPLATE_NAMES = {
  KNOWLEDGE_QUERY: "shell:knowledge-query",
  BASE_ENTITY_DISPLAY: "shell:base-entity-display",
  CONTENT_GENERATION: "shell:content-generation",
} as const;

/**
 * Shell core datasource ID constants
 */
export const SHELL_DATASOURCE_IDS = {
  ENTITIES: "shell:entities",
} as const;
