import type { BaseEntity, EntityInput, SearchResult } from "@brains/types";

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
  getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null>;
  createEntity<T extends BaseEntity>(
    entity: EntityInput<T>,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }>;
  updateEntity<T extends BaseEntity>(
    entity: T,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }>;
  deleteEntity(entityType: string, id: string): Promise<boolean>;

  // Query operations
  listEntities<T extends BaseEntity>(
    type: string,
    options?: ListOptions,
  ): Promise<T[]>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Entity type information
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;

  // Serialization operations
  serializeEntity(entity: BaseEntity): string;
  deserializeEntity(markdown: string, entityType: string): Partial<BaseEntity>;

  // Check async job status
  getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null>;
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
