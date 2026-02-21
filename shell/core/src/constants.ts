export const SHELL_ENTITY_TYPES = {
  BASE: "base",
  IDENTITY: "identity",
  PROFILE: "profile",
  IMAGE: "image",
} as const;

export const SHELL_TEMPLATE_NAMES = {
  KNOWLEDGE_QUERY: "shell:knowledge-query",
  BASE_ENTITY_DISPLAY: "shell:base-entity-display",
  CONTENT_GENERATION: "shell:content-generation",
} as const;

export const SHELL_DATASOURCE_IDS = {
  ENTITIES: "shell:entities",
} as const;
