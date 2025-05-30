/**
 * @brains/base-entity
 *
 * Base entity adapter and utilities for the brain system.
 * Provides fallback handling for generic entities with markdown serialization.
 */

// Export the adapter and formatter
export { BaseEntityAdapter } from "./adapter";
export { BaseEntityFormatter } from "./formatter";

// Export schema for creating entities
export { createBaseEntitySchema, type CreateBaseEntity } from "./schema";
