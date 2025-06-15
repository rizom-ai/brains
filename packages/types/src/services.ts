import type { BaseEntity, SearchResult } from "./entities";
import type { EntityAdapter } from "@brains/base-entity";
import type {
  ContentTemplate,
  ContentGenerateOptions,
  BatchGenerateOptions,
} from "./plugin";

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

  // Derive entities
  deriveEntity<T extends BaseEntity>(
    sourceEntityId: string,
    sourceEntityType: string,
    targetEntityType: string,
    options?: { deleteSource?: boolean },
  ): Promise<T>;
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

/**
 * Content generation service interface
 */
export interface ContentGenerationService {
  /**
   * Initialize with dependencies
   */
  initialize(
    queryProcessor: unknown, // We don't want circular dependency with shell types
    contentTypeRegistry: unknown,
    logger: unknown,
  ): void;

  /**
   * Generate content matching a schema
   */
  generate<T>(options: ContentGenerateOptions<T>): Promise<T>;

  /**
   * Generate multiple content pieces
   */
  generateBatch<T>(options: BatchGenerateOptions<T>): Promise<T[]>;

  /**
   * Register reusable templates
   */
  registerTemplate<T>(name: string, template: ContentTemplate<T>): void;

  /**
   * Get registered template
   */
  getTemplate(name: string): ContentTemplate<unknown> | null;

  /**
   * List all templates
   */
  listTemplates(): ContentTemplate<unknown>[];

  /**
   * Generate content using a registered template
   */
  generateFromTemplate(
    templateName: string,
    options: Omit<ContentGenerateOptions<unknown>, "schema">,
  ): Promise<unknown>;

  /**
   * Generate content for a specific content type, handling collections automatically
   */
  generateContent(
    contentType: string,
    options?: {
      prompt?: string;
      context?: Record<string, unknown>;
    },
  ): Promise<unknown>;
}
