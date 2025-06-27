/**
 * @brains/types - Shared type definitions for the Brain system
 *
 * This package contains all the shared types and interfaces that are used
 * across the Brain ecosystem, including the shell and all plugins.
 */

// Entity types
export type {
  BaseEntity,
  EntityInput,
  SearchResult,
  SiteContentPreview,
  SiteContentProduction,
} from "./entities";
export {
  baseEntitySchema,
  siteContentPreviewSchema,
  siteContentProductionSchema,
} from "./entities";

// Plugin types
export type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginTool,
  PluginResource,
  GenerationContext,
  Template,
  ProgressNotification,
  ComponentType,
} from "./plugin";
export { pluginMetadataSchema, TemplateSchema } from "./plugin";

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
  IEmbeddingService,
  Command,
  CommandResponse,
  BrainProtocol,
  EntityRegistry,
  AIService,
  AIModelConfig,
  PluginManager,
  PluginInfo,
  PluginManagerEventMap,
  PluginToolRegisterEvent,
  PluginResourceRegisterEvent,
} from "./services";

// Export enums separately
export { PluginStatus, PluginEvent } from "./services";

// Formatter types
export type { SchemaFormatter, ContentFormatter } from "./formatters";

// Content types
export type { ContentRegistry, ContentConfig } from "./content";

// View types and schemas
export type {
  RouteDefinition,
  SectionDefinition,
  ViewTemplate,
  OutputFormat,
  WebRenderer,
  SiteBuilderOptions,
  BuildResult,
  ContentGenerationRequest,
  RouteRegistry,
  ViewTemplateRegistry,
  ViewRegistry,
  SiteBuilder,
  SiteContentEntityType,
} from "./views";
export {
  RouteDefinitionSchema,
  SectionDefinitionSchema,
  ViewTemplateSchema,
  SiteBuilderOptionsSchema,
  BuildResultSchema,
  ContentGenerationRequestSchema,
  SiteContentEntityTypeSchema,
} from "./views";

// Re-export commonly used types from utils
export type { Logger } from "@brains/utils";

// Response schemas
export {
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
} from "./schemas";
export type {
  DefaultQueryResponse,
  SimpleTextResponse,
  CreateEntityResponse,
  UpdateEntityResponse,
} from "./schemas";
