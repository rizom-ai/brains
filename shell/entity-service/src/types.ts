import type {
  BaseEntity,
  EntityInput,
  EntityService as IEntityService,
} from "@brains/types";

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
 * Extends the public interface with additional shell-specific methods
 */
export interface EntityService extends IEntityService {
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

  // Check async entity creation/update status
  getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    entityId?: string;
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
import type { EntityAdapter } from "@brains/base-entity";
