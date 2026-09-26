/**
 * @brains/content-pipeline
 *
 * The publish pipeline: one queue per entity type, a schedule that drains it,
 * and the record of what went out. It owns no entity types — every type it
 * publishes belongs to a package that delegated the act by declaring
 * `publish`.
 */
import { contentPipelineService } from "./service";

export {
  contentPipelineService,
  type ContentPipelineDeps,
  type ContentPipelineState,
} from "./service";
export type { PipelineEntityReads, PipelineRuntime } from "./runtime";

// Schemas
export * from "./schemas/publishable";

// Types
export * from "./types/provider";
export * from "./types/messages";
export * from "./types/config";

// Service components (for direct use or testing)
export { QueueManager, type QueueEntry } from "./queue-manager";
export { ProviderRegistry } from "./provider-registry";
export {
  ContentScheduler,
  type SchedulerConfig,
  type PublishSuccessEvent,
  type PublishFailedEvent,
  type GenerateExecuteEvent,
  type GenerationConditionResult,
} from "./scheduler";
export { RetryTracker, type RetryInfo } from "./retry-tracker";
export {
  BunSchedulerBackend,
  type CronScheduleOptions,
  type SchedulerBackend,
  type ScheduledJob,
} from "./scheduler-backend";
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
export { PublicationQueueService } from "./publication-queue-service";
export {
  markEntityPublished,
  updatePublishFrontmatter,
  type MarkPublishedOptions,
} from "./publish-state-updater";
export {
  getPublicationPipelineSnapshot,
  publicationPipelineSnapshotSchema,
  type PublicationPipelineSnapshot,
} from "./pipeline-snapshot";

// Tools
export {
  handlePublishingManage,
  publishingManageInputSchema,
  publishingManageOutputSchema,
  type PublishingManageInput,
  type PublishingManageOutput,
  type PublishingManageServices,
  handleQueueAction,
  queueOutputSchema,
  queueItemSchema,
  type QueueInput,
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

/** The pipeline with its production collaborators, for a brain's composition. */
const contentPipelinePackage: ReturnType<typeof contentPipelineService> =
  contentPipelineService();
export default contentPipelinePackage;
