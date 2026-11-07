export const ENTITY_CHANNELS = {
  created: "entity:created",
  updated: "entity:updated",
  deleted: "entity:deleted",
  embeddingReady: "entity:embedding:ready",
} as const;

export const JOB_CHANNELS = {
  progress: "job-progress",
} as const;

export const NEWSLETTER_CHANNELS = {
  generation: "newsletter:generation",
} as const;

/** The publish events content-pipeline broadcasts. */
export const PUBLISH_CHANNELS = {
  completed: "publish:completed",
  failed: "publish:failed",
} as const;

export const SHELL_CHANNELS = {
  contentGeneration: "shell:content-generation",
  embedding: "shell:embedding",
} as const;

export const PLUGIN_CHANNELS = {
  toolExecute: (pluginId: string): string => `plugin:${pluginId}:tool:execute`,
} as const;

export const SITE_CHANNELS = {
  buildCompleted: "site:build:completed",
} as const;
