/**
 * Entity Service specific error classes
 * Domain-specific errors for entity operations
 */

import { BrainsError, type ErrorCause } from "@brains/utils";

/**
 * Entity not found error
 */
export class EntityNotFoundError extends BrainsError {
  constructor(
    entityId: string,
    entityType?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = entityType
      ? `Entity not found: ${entityType}:${entityId}`
      : `Entity not found: ${entityId}`;

    super(message, "ENTITY_NOT_FOUND", cause, {
      entityId,
      entityType,
      ...context,
    });
  }
}

/**
 * Entity validation error
 */
export class EntityValidationError extends BrainsError {
  constructor(
    entityType: string,
    validationErrors: string[] | string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const errors = Array.isArray(validationErrors)
      ? validationErrors
      : [validationErrors];

    super(
      `Entity validation failed for ${entityType}: ${errors.join(", ")}`,
      "ENTITY_VALIDATION_FAILED",
      cause,
      { entityType, validationErrors: errors, ...context },
    );
  }
}

/**
 * Entity storage error
 */
export class EntityStorageError extends BrainsError {
  constructor(
    operation: "create" | "update" | "delete" | "read",
    entityId?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = entityId
      ? `Entity storage ${operation} failed for entity: ${entityId}`
      : `Entity storage ${operation} failed`;

    super(message, "ENTITY_STORAGE_ERROR", cause, {
      operation,
      entityId,
      ...context,
    });
  }
}

/**
 * Entity index error (search/embedding related)
 */
export class EntityIndexError extends BrainsError {
  constructor(
    operation: "index" | "search" | "embedding",
    entityId?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = entityId
      ? `Entity ${operation} failed for entity: ${entityId}`
      : `Entity ${operation} operation failed`;

    super(message, "ENTITY_INDEX_ERROR", cause, {
      operation,
      entityId,
      ...context,
    });
  }
}

/**
 * Entity type registration error (for EntityRegistry)
 */
export class EntityTypeRegistrationError extends BrainsError {
  constructor(
    entityType: string,
    reason: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Entity type registration failed for ${entityType}: ${reason}`,
      "ENTITY_TYPE_REGISTRATION_FAILED",
      cause,
      { entityType, reason, ...context },
    );
  }
}

/**
 * Entity serialization error
 */
export class EntitySerializationError extends BrainsError {
  constructor(
    operation: "serialize" | "deserialize",
    entityType?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = entityType
      ? `Entity ${operation} failed for type: ${entityType}`
      : `Entity ${operation} failed`;

    super(message, "ENTITY_SERIALIZATION_ERROR", cause, {
      operation,
      entityType,
      ...context,
    });
  }
}
