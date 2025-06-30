/**
 * @brains/types - Shared type definitions for the Brain system
 *
 * This package contains all the shared types and interfaces that are used
 * across the Brain ecosystem, including the shell and all plugins.
 */

// Entity types
export type { BaseEntity, EntityInput, SearchResult } from "./entities";
export { baseEntitySchema } from "./entities";

// Template types (used by both content and plugins)
export type { ComponentType, GenerationContext, Template } from "./templates";
export { TemplateSchema } from "./templates";

// Registry types
export type { ServiceRegistry, ComponentFactory } from "./registry";

// Service interfaces (minimal shared contracts only)
export type { Command, CommandResponse, BrainProtocol } from "./services";

// Formatter types
export type { SchemaFormatter, ContentFormatter } from "./formatters";

// Content types
export type { ContentRegistry, ContentConfig } from "./content";

// View types have been moved to @brains/view-registry

// Re-export commonly used types from utils
export type { Logger } from "@brains/utils";

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
