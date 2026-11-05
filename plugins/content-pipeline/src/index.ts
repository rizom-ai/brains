/**
 * @brains/content-pipeline
 *
 * Plugin for managing content publishing pipeline and scheduling.
 * Provides centralized queue management, scheduling, and retry logic
 * for all publishable entity types.
 */

// Schemas
export * from "./schemas/publishable";

// Types
export * from "./types/provider";
export * from "./types/messages";
export * from "./types/config";

// Service components (for direct use or testing)
export { QueueManager, type QueueEntry } from "./queue-manager";
export { ProviderRegistry } from "./provider-registry";
export { ContentScheduler } from "./scheduler";
export type {
  SchedulerConfig,
  PublishSuccessEvent,
  PublishFailedEvent,
  GenerateExecuteEvent,
  GenerationConditionResult,
} from "./types/scheduler";
export { RetryTracker, type RetryInfo } from "./retry-tracker";
export {
  PublishAssetRegistry,
  publishAssetDefinitionSchema,
  publishAssetTargetFieldSchema,
  type PublishAssetDefinition,
  type PublishAssetTargetField,
} from "./publish-assets";
export {
  PublishAssetPreflight,
  type PublishAssetPreflightResult,
} from "./publish-asset-preflight";
export {
  PublishExecutor,
  type PublishEntityExecutor,
  type PublishEntityInput,
  type PublishEntityResult,
} from "./publish-executor";
export {
  markEntityPublished,
  updatePublishFrontmatter,
  type MarkPublishedOptions,
} from "./publish-state-updater";

// Tools
export {
  createPublishingManageTool,
  publishingManageInputSchema,
  publishingManageOutputSchema,
  type PublishingManageInput,
  type PublishingManageOutput,
  type PublishingManageServices,
  handleQueueAction,
  queueOutputSchema,
  queueItemSchema,
  type QueueActionInput,
  type QueueOutput,
  type QueueItem,
  handlePublishAction,
  publishOutputSchema,
  type PublishInput,
  type PublishOutput,
  ensurePublishAssets,
  ensureAssetsInputSchema,
  ensureAssetsOutputSchema,
  type EnsureAssetsInput,
  type EnsureAssetsOutput,
  type EnsurePublishAssetsOptions,
} from "./tools";

// Plugin
export { ContentPipelinePlugin, contentPipelinePlugin } from "./plugin";
