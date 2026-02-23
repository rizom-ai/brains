export const SHELL_ENTITY_TYPES = {
  BASE: "base",
  BRAIN_CHARACTER: "brain-character",
  ANCHOR_PROFILE: "anchor-profile",
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
