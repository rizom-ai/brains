export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";
export { EmbeddingQueueService } from "./embedding-queue/embeddingQueueService";
export { EmbeddingQueueWorker } from "./embedding-queue/embeddingQueueWorker";
export { JobQueueService } from "./job-queue/jobQueueService";
export { JobQueueWorker } from "./job-queue/jobQueueWorker";
export { EmbeddingJobHandler } from "./job-queue/handlers/embeddingJobHandler";

// Export types
export type {
  ListOptions,
  SearchOptions,
  EntityService as IEntityService,
  EntityRegistry as IEntityRegistry,
} from "./types";

// Export error classes
export {
  EntityNotFoundError,
  EntityValidationError,
  EntityStorageError,
  EntityIndexError,
  EntityTypeRegistrationError,
  EntitySerializationError,
} from "./errors";
