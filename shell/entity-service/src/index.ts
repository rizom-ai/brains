export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";
export { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";

// Export types
export type {
  ListOptions,
  SearchOptions,
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
