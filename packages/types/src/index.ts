/**
 * @brains/types - Shared type definitions for the Brain system
 *
 * This package contains all the shared types and interfaces that are used
 * across the Brain ecosystem, including the shell and all plugins.
 */

// Entity types
export type { BaseEntity, SearchResult } from "./entities";
export { baseEntitySchema } from "./entities";

// Plugin types
export type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginTool,
  PluginResource,
  ContentGenerateOptions,
  ContentTemplate,
  BatchGenerateOptions,
} from "./plugin";
export { pluginMetadataSchema } from "./plugin";

// Registry types
export type { Registry, ComponentFactory } from "./registry";

// Messaging types
export type {
  BaseMessage,
  MessageWithPayload,
  MessageResponse,
  MessageHandler,
  MessageBus,
} from "./messaging";

// Service interfaces
export type {
  ListOptions,
  SearchOptions,
  EntityService,
  ContentGenerationService,
  Command,
  CommandResponse,
  BrainProtocol,
  EntityRegistry,
  AIService,
  AIModelConfig,
  QueryProcessor,
  QueryOptions,
  QueryResult,
  PluginManager,
  PluginInfo,
  PluginManagerEventMap,
  PluginToolRegisterEvent,
  PluginResourceRegisterEvent,
  SchemaRegistry,
} from "./services";

// Export enums separately
export { PluginStatus, PluginEvent } from "./services";

// Formatter types
export type { SchemaFormatter, ContentFormatter } from "./formatters";

// Content types
export type { ContentTypeRegistry } from "./content";

// Re-export commonly used types from utils
export type { Logger } from "@brains/utils";
