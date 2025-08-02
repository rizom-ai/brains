/**
 * Entity Service specific error classes
 * Domain-specific errors for entity operations
 */

/**
 * Entity not found error
 */
export class EntityNotFoundError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EntityNotFoundError";
  }
}

/**
 * Entity validation error
 */
export class EntityValidationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EntityValidationError";
  }
}

/**
 * Entity storage error
 */
export class EntityStorageError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EntityStorageError";
  }
}

/**
 * Entity index error (search/embedding related)
 */
export class EntityIndexError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EntityIndexError";
  }
}

/**
 * Entity type registration error (for EntityRegistry)
 */
export class EntityTypeRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EntityTypeRegistrationError";
  }
}

/**
 * Entity serialization error
 */
export class EntitySerializationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EntitySerializationError";
  }
}
