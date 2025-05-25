/**
 * Personal Brain Shell Package
 *
 * This is the core package that provides the foundational architecture
 * for the Personal Brain application.
 */

// Main Shell entry point
export { Shell } from "./shell";

// Configuration
export { shellConfigSchema, createShellConfig } from "./config";
export type { ShellConfig } from "./config";

// Core Components
export { QueryProcessor } from "./query/queryProcessor";
export { BrainProtocol } from "./protocol/brainProtocol";
export { EntityService } from "./entity/entityService";
export { EntityRegistry } from "./entity/entityRegistry";
export { SchemaRegistry } from "./schema/schemaRegistry";
export { PluginManager } from "./plugins/pluginManager";

// Services
export { EmbeddingService } from "./embedding/embeddingService";
export type { IEmbeddingService } from "./embedding/embeddingService";
export { AIService } from "./ai/aiService";
export type { AIModelConfig } from "./ai/aiService";

// Messaging Components
export { MessageBus } from "./messaging/messageBus";
export { MessageFactory } from "./messaging/messageFactory";
export type {
  BaseMessage,
  MessageResponse,
  MessageWithPayload,
} from "./messaging/types";

// Registry & Utilities
export { Registry } from "./registry/registry";

// MCP Integration
export { registerShellMCP } from "./mcp";
export type { ShellMCPOptions } from "./mcp";

// Database exports
export type { DrizzleDB } from "./db";
export { createDatabase, runMigrations } from "./db";
export * from "./db/schema";

// Types that are shell-specific
export type {
  SerializableEntity,
  SerializableQueryResult,
} from "./types";

// Schemas for validation
export {
  serializableEntitySchema,
  serializableCitationSchema,
  serializableQueryResultSchema,
} from "./types";

// Serialization utilities
export {
  toSerializableEntity,
  toSerializableQueryResult,
  validateAndSerializeQueryResult,
} from "./utils/serialization";

