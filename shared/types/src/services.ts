import type { BaseEntity, EntityInput, SearchResult } from "./entities";
import type { EntityAdapter } from "@brains/base-entity";
import type { Plugin, PluginTool, PluginResource } from "@brains/plugin-utils";
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
 * Interface for embedding service
 */
export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<Float32Array>;
  generateEmbeddings(texts: string[]): Promise<Float32Array[]>;
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
