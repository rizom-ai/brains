export const BUTTONDOWN_CHANNELS = {
  isConfigured: "buttondown:is-configured",
  send: "buttondown:send",
} as const;

export const DIRECTORY_SYNC_CHANNELS = {
  getRepoInfo: "git-sync:get-repo-info",
  configureRequest: "sync:configure:request",
  initialCompleted: "sync:initial:completed",
  entityExportRequest: "entity:export:request",
  entityImportRequest: "entity:import:request",
} as const;

export const ENTITY_CHANNELS = {
  created: "entity:created",
  updated: "entity:updated",
  deleted: "entity:deleted",
  embeddingReady: "entity:embedding:ready",
} as const;

export const GENERATE_CHANNELS = {
  register: "generate:register",
  completed: "generate:completed",
  failed: "generate:failed",
  skipped: "generate:skipped",
} as const;

export const IMAGE_CHANNELS = {
  generate: "image:image-generate",
} as const;

export const JOB_CHANNELS = {
  progress: "job-progress",
} as const;

export const NEWSLETTER_CHANNELS = {
  generation: "newsletter:generation",
} as const;

export const PROJECT_CHANNELS = {
  generation: "project:generation",
} as const;

export const PUBLISH_CHANNELS = {
  execute: "publish:execute",
  queue: "publish:queue",
  direct: "publish:direct",
  remove: "publish:remove",
  reorder: "publish:reorder",
  list: "publish:list",
  reportSuccess: "publish:report:success",
  reportFailure: "publish:report:failure",
  queued: "publish:queued",
  completed: "publish:completed",
  failed: "publish:failed",
  listResponse: "publish:list:response",
} as const;

export const PROJECTION_CHANNELS = {
  waveReady: "projection:wave-ready",
} as const;

export const SHELL_CHANNELS = {
  contentGeneration: "shell:content-generation",
  embedding: "shell:embedding",
} as const;

export const PLUGIN_CHANNELS = {
  toolExecute: (pluginId: string): string => `plugin:${pluginId}:tool:execute`,
  progress: (pluginId: string): string => `plugin:${pluginId}:progress`,
  resourceGet: (pluginId: string): string => `plugin:${pluginId}:resource:get`,
} as const;

export const SITE_BUILDER_CHANNELS = {
  routeUnregister: "plugin:site-builder:route:unregister",
  routeList: "plugin:site-builder:route:list",
  routeGet: "plugin:site-builder:route:get",
} as const;

export const SITE_CHANNELS = {
  buildCompleted: "site:build:completed",
} as const;

export const SOCIAL_CHANNELS = {
  autoGenerate: "social:auto-generate",
} as const;
