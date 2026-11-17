/**
 * @brains/content-pipeline
 *
 * Plugin for managing content publishing pipeline and scheduling.
 * Provides centralized queue management, scheduling, and retry logic
 * for all publishable entity types.
 */

import { createContentPipelinePackage } from "./plugin";

// Schemas
export * from "./schemas/publishable";

// Types
export * from "./types/messages";
export * from "./types/config";

// Service components (for direct use or testing)
export { QueueManager, type QueueEntry } from "./queue-manager";
export { ProviderRegistry } from "./provider-registry";
export { ContentScheduler } from "./scheduler";
export type {
  SchedulerConfig,
  PublishSuccessEvent,
  GenerateExecuteEvent,
  GenerationConditionResult,
} from "./types/scheduler";
export { RetryTracker, type RetryInfo } from "./retry-tracker";
export { PublishAssetRegistry } from "./publish-assets";
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

// Package
export {
  createContentPipelinePackage,
  type ContentPipelineDeps,
  type ContentPipelineServices,
} from "./plugin";
export type { PipelineContext } from "./lib/pipeline-context";

/** The publishing pipeline as a brain composes it. */
const contentPipelinePackage: ReturnType<typeof createContentPipelinePackage> =
  createContentPipelinePackage();
export default contentPipelinePackage;
