import type { BaseEntity, SearchResult } from "./entities";
import type { EntityAdapter } from "@brains/base-entity";
import type {
  ContentTemplate,
  ContentGenerateOptions,
  BatchGenerateOptions,
  Plugin,
  PluginTool,
  PluginResource,
} from "./plugin";
import type { ContentFormatter } from "./formatters";
import type { z } from "zod";

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

/**
 * AI Service interface for generating text and structured objects
 */
export interface AIService {
  generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{
    text: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  generateObject<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<{
    object: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  updateConfig(config: Partial<AIModelConfig>): void;

  getConfig(): AIModelConfig;
}

/**
 * AI model configuration
 */
export interface AIModelConfig {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Query Processor interface for processing queries with AI
 */
export interface QueryProcessor {
  processQuery<T = unknown>(
    query: string,
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>>;

  getSchemaName<T>(schema: z.ZodType<T>): string | undefined;
}

/**
 * Query options for QueryProcessor
 */
export interface QueryOptions<T> {
  schema: z.ZodType<T>;
}

/**
 * Query result type
 */
export type QueryResult<T> = T;

/**
 * Plugin Manager interface for managing plugin lifecycle
 */
export interface PluginManager {
  registerPlugin(plugin: Plugin): void;

  initializePlugins(): Promise<void>;

  getPlugin(id: string): Plugin | undefined;

  getPluginStatus(id: string): PluginStatus | undefined;

  hasPlugin(id: string): boolean;

  isPluginInitialized(id: string): boolean;

  getAllPluginIds(): string[];

  getAllPlugins(): Map<string, PluginInfo>;

  getFailedPlugins(): Array<{ id: string; error: Error }>;

  disablePlugin(id: string): void;

  enablePlugin(id: string): void;

  on<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void;

  once<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void;

  off<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void;
}

/**
 * Plugin status types
 */
export enum PluginStatus {
  REGISTERED = "registered",
  INITIALIZED = "initialized",
  ERROR = "error",
  DISABLED = "disabled",
}

/**
 * Plugin metadata with status
 */
export interface PluginInfo {
  plugin: Plugin;
  status: PluginStatus;
  error?: Error;
  dependencies: string[];
}

/**
 * Plugin lifecycle event types
 */
export enum PluginEvent {
  REGISTERED = "plugin:registered",
  BEFORE_INITIALIZE = "plugin:before_initialize",
  INITIALIZED = "plugin:initialized",
  ERROR = "plugin:error",
  DISABLED = "plugin:disabled",
  ENABLED = "plugin:enabled",
  TOOL_REGISTER = "plugin:tool:register",
  RESOURCE_REGISTER = "plugin:resource:register",
}

/**
 * Typed event map for PluginManager events
 */
export interface PluginManagerEventMap {
  [PluginEvent.REGISTERED]: [pluginId: string, plugin: Plugin];
  [PluginEvent.BEFORE_INITIALIZE]: [pluginId: string, plugin: Plugin];
  [PluginEvent.INITIALIZED]: [pluginId: string, plugin: Plugin];
  [PluginEvent.ERROR]: [pluginId: string, error: Error];
  [PluginEvent.DISABLED]: [pluginId: string];
  [PluginEvent.ENABLED]: [pluginId: string];
  [PluginEvent.TOOL_REGISTER]: [event: PluginToolRegisterEvent];
  [PluginEvent.RESOURCE_REGISTER]: [event: PluginResourceRegisterEvent];
}

/**
 * Event data for plugin tool registration
 */
export interface PluginToolRegisterEvent {
  pluginId: string;
  tool: PluginTool;
}

/**
 * Event data for plugin resource registration
 */
export interface PluginResourceRegisterEvent {
  pluginId: string;
  resource: PluginResource;
}

/**
 * Schema Registry interface for managing Zod schemas
 */
export interface SchemaRegistry {
  register(name: string, schema: z.ZodType<unknown>): void;

  get<T = unknown>(name: string): z.ZodType<T> | undefined;

  has(name: string): boolean;

  remove(name: string): boolean;

  getSchemaNames(): string[];

  getAllSchemaNames(): string[];

  validate<T = unknown>(
    name: string,
    data: unknown,
  ): { success: true; data: T } | { success: false; error: z.ZodError };

  clear(): void;
}

/**
 * Content Type Registry interface
 */
export interface ContentTypeRegistry {
  register(
    contentType: string,
    schema: z.ZodType<unknown>,
    formatter?: ContentFormatter<unknown>,
  ): void;

  get(contentType: string): z.ZodType<unknown> | null;

  list(namespace?: string): string[];

  has(contentType: string): boolean;

  getFormatter<T = unknown>(contentType: string): ContentFormatter<T> | null;

  clear(): void;
}
