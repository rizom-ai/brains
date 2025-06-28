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
  // Core CRUD operations
  getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null>;
  listEntities<T extends BaseEntity>(
    entityType: string,
    options?: Omit<ListOptions, "entityType">,
  ): Promise<T[]>;
  createEntity<T extends BaseEntity>(entity: EntityInput<T>): Promise<T>;
  updateEntity<T extends BaseEntity>(entity: T): Promise<T>;
  deleteEntity(id: string): Promise<boolean>;

  // Search and discovery
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Entity transformation - useful for promotion/rollback workflows
  deriveEntity<T extends BaseEntity>(
    sourceEntityId: string,
    sourceEntityType: string,
    targetEntityType: string,
    options?: { deleteSource?: boolean },
  ): Promise<T>;

  // Entity type discovery
  getEntityTypes(): string[];

  // Entity serialization for file system synchronization (directory-sync plugin)
  serializeEntity(entity: BaseEntity): string;
  deserializeEntity(markdown: string, entityType: string): Partial<BaseEntity>;
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
import type { SearchResult } from "@brains/types";
import type { EntityAdapter } from "@brains/base-entity";
