import type { BaseEntity, SearchResult } from "./entities";
import type { EntityAdapter } from "@brains/base-entity";

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
}

/**
 * Entity service interface
 */
export interface EntityService {
  // Create, read, update, delete
  createEntity<T extends BaseEntity>(
    entity: Omit<T, "id" | "created" | "updated"> & {
      id?: string;
      created?: string;
      updated?: string;
    },
  ): Promise<T>;

  getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null>;

  updateEntity<T extends BaseEntity>(entity: T): Promise<T>;

  deleteEntity(id: string): Promise<boolean>;

  // List and search
  listEntities<T extends BaseEntity>(
    entityType: string,
    options?: Omit<ListOptions, "entityType">,
  ): Promise<T[]>;

  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Entity type management
  getEntityTypes(): string[];
  getAdapter<T extends BaseEntity>(entityType: string): EntityAdapter<T>;
  hasAdapter(entityType: string): boolean;

  // Import/export
  importRawEntity(data: {
    entityType: string;
    id: string;
    content: string;
    created: Date;
    updated: Date;
  }): Promise<void>;
}

/**
 * Command structure for Brain Protocol
 */
export interface Command {
  id: string;
  command: string;
  args?: Record<string, unknown>;
  context?: {
    userId?: string;
    conversationId?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Command response structure
 */
export interface CommandResponse {
  id: string;
  commandId: string;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Brain protocol interface
 */
export interface BrainProtocol {
  registerCommandHandler(
    command: string,
    handler: (cmd: Command) => Promise<CommandResponse>,
  ): void;

  executeCommand(command: Command): Promise<CommandResponse>;
}
