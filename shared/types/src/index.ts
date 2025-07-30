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

// Content types have been moved to @brains/content-management

// Registry types have been moved to their respective implementation packages

// Service interfaces have been moved to their respective implementation packages

// Formatter types have been moved to @brains/utils

// Job types have been moved to @brains/job-queue

// View types have been moved to @brains/view-registry

// Messaging types have been moved to @brains/messaging-service

// Shell interface
export type { IShell } from "./shell";

// Message context
export type { MessageContext } from "./interfaces";

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

// Permission types have been moved to @brains/utils
