import type { BaseEntity, SearchResult } from "./entities";
import type { z } from "zod";

/**
 * Entity adapter interface for converting between entities and markdown
 */
export interface EntityAdapter<T extends BaseEntity> {
  entityType: string;
  schema: z.ZodSchema<T>;
  fromMarkdown(markdown: string): T;
  toMarkdown(entity: T): string;
}

/**
 * List entities options
 */
export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: "created" | "updated";
  sortDirection?: "asc" | "desc";
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
    entity: Omit<T, "id"> & { id?: string },
  ): Promise<T>;

  getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null>;

  updateEntity<T extends BaseEntity>(entity: T): Promise<T>;

  deleteEntity(entityType: string, id: string): Promise<void>;

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
    title: string;
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
