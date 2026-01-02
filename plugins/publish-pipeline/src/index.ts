/**
 * @brains/publish-pipeline
 *
 * Plugin for managing entity publishing queues and scheduling.
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
export {
  PublishScheduler,
  type SchedulerConfig,
  type PublishSuccessEvent,
  type PublishFailedEvent,
} from "./scheduler";
export {
  RetryTracker,
  type RetryConfig,
  type RetryInfo,
} from "./retry-tracker";

// Tools
export {
  createQueueTool,
  queueInputSchema,
  queueOutputSchema,
  queueItemSchema,
  type QueueInput,
  type QueueOutput,
  type QueueItem,
  createPublishTool,
  publishInputSchema,
  publishOutputSchema,
  type PublishInput,
  type PublishOutput,
} from "./tools";

// Plugin
export { PublishPipelinePlugin, publishPipelinePlugin } from "./plugin";
