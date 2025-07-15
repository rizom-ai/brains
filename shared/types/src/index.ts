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
  EntityAdapter,
} from "./entities";
export { baseEntitySchema } from "./entities";
export { BaseEntityFormatter } from "./base-entity-formatter";

// Template types (used by both content and plugins)
export type {
  ComponentType,
  GenerationContext,
  Template,
  TemplateDataContext,
} from "./templates";
export { TemplateSchema } from "./templates";

// Content types (site content, routes, sections)
export type {
  SiteContentEntity,
  RouteDefinition,
  SectionDefinition,
  SiteContentEntityType,
  ContentConfig,
  ContentRegistry,
} from "./content";
export { SiteContentEntityTypeSchema } from "./content";

// Registry types
export type { ServiceRegistry, ComponentFactory } from "./registry";

// Service interfaces (minimal shared contracts only)
export type {
  Command,
  CommandResponse,
  BrainProtocol,
  EntityService,
  AIService,
} from "./services";

// Formatter types
export type { SchemaFormatter, ContentFormatter } from "./formatters";

// Job types
export type { Job } from "./jobs";
export { jobSchema } from "./jobs";

// View types have been moved to @brains/view-registry

// Messaging types
export type {
  MessageResponse,
  MessageWithPayload,
  MessageHandler,
  MessageSender,
  BaseMessage,
} from "./messaging";
export {
  messageResponseSchema,
  messageWithPayloadSchema,
  baseMessageSchema,
} from "./messaging";

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

// Permission types
export { UserPermissionLevelSchema } from "./permissions";
export type { UserPermissionLevel } from "./permissions";
