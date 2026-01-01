/**
 * @brains/publish-service
 *
 * Shell service for managing entity publishing queues and scheduling.
 * Provides centralized queue management, scheduling, and retry logic
 * for all publishable entity types.
 */

// Schemas
export * from "./schemas/publishable";

// Types
export * from "./types/provider";
export * from "./types/messages";
export * from "./types/config";

// Service components
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

// Main service
export { PublishService, type PublishServiceConfig } from "./publish-service";
