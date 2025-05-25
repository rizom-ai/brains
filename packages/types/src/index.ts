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
export type { Plugin, PluginContext } from "./plugin";

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
  EntityAdapter,
  ListOptions,
  SearchOptions,
  EntityService,
  Command,
  CommandResponse,
  BrainProtocol,
} from "./services";

// Re-export commonly used types from utils
export type { Logger } from "@brains/utils";
