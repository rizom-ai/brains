export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";

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
