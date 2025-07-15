import type { BaseEntity, EntityInput } from "@brains/types";

/**
 * List entities options
 */
export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: "created" | "updated";
  sortDirection?: "asc" | "desc";
  filter?: {
    // Flexible metadata filter - can query any frontmatter field
    metadata?: Record<string, unknown>;
  };
}

/**
 * Search options
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  types?: string[];
  sortBy?: "relevance" | "created" | "updated";
  sortDirection?: "asc" | "desc";
}

/**
 * Entity service interface for managing brain entities
 */
export interface EntityService {
  // Core entity operations
  getEntity<T extends BaseEntity>(entityId: string): Promise<T | null>;
  createEntity<T extends BaseEntity>(entity: EntityInput<T>): Promise<T>;
  updateEntity<T extends BaseEntity>(entity: T): Promise<T>;
  deleteEntity(entityId: string): Promise<void>;
  deriveEntity<T extends BaseEntity>(
    sourceEntityId: string,
    targetType: string,
    metadata?: Record<string, unknown>,
  ): Promise<T>;

  // Query operations
  listEntities<T extends BaseEntity>(
    type: string,
    options?: ListOptions,
  ): Promise<T[]>;
  search<T extends BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<Array<{ entity: T; score: number }>>;

  // Entity type information
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;
  // Additional shell-specific methods for async operations

  // Async entity creation (returns immediately, embedding generated in background)
  createEntityAsync<T extends BaseEntity>(
    entity: EntityInput<T>,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }>;

  // Async entity update (returns immediately, embedding generated in background)
  updateEntityAsync<T extends BaseEntity>(
    entity: T,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }>;

  // Check async job status
  getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null>;

  // The sync methods are inherited from the public interface
}

/**
 * Entity Registry interface for managing entity types and their schemas/adapters
 */
export interface EntityRegistry {
  registerEntityType<TEntity extends BaseEntity>(
    type: string,
    schema: z.ZodType<unknown>,
    adapter: EntityAdapter<TEntity>,
  ): void;

  getSchema(type: string): z.ZodType<unknown>;

  getAdapter<T extends BaseEntity>(type: string): EntityAdapter<T>;

  hasEntityType(type: string): boolean;

  validateEntity<TData = unknown>(type: string, entity: unknown): TData;

  getAllEntityTypes(): string[];
}

// Import only the necessary types from other packages
import type { z } from "zod";
import type { EntityAdapter } from "@brains/types";
