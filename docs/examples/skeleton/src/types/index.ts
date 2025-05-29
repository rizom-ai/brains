/**
 * Core types for the Skeleton Application
 *
 * This file defines the fundamental types used throughout the application.
 */
import { z } from "zod";

/**
 * Base Entity interface
 * Common properties for all entity types
 */
export interface BaseEntity {
  id: string;
  type: string;
  title?: string;
  content?: string;
  created: string;
  updated: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Entity interface
 * Extends BaseEntity with content model capabilities
 */
export interface Entity extends BaseEntity {
  embedding?: number[];
}

/**
 * Intent Analysis result
 * Provides information about query intent
 */
export interface IntentAnalysis {
  primaryIntent: string;
  entityTypes: string[];
  shouldSearchExternal?: boolean;
  confidenceScore: number;
}

/**
 * Citation for an entity
 * Used in query results to cite sources
 */
export interface Citation {
  entityId: string;
  entityType: string;
  entityTitle: string;
  excerpt: string;
}

/**
 * Query Options
 * Options for processing a query
 */
export interface QueryOptions<T = unknown> {
  userId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  schema?: z.ZodType<T>;
}

/**
 * Query Result
 * Result of processing a query
 */
export interface QueryResult<T = unknown> {
  answer: string;
  citations: Citation[];
  relatedEntities: Entity[];
  object?: T;
}

/**
 * Model Response
 * Response from an AI model
 */
export interface ModelResponse<T = unknown> {
  object?: T;
  text?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * IQueryProcessor Interface
 * Defines the contract for the QueryProcessor
 */
export interface IQueryProcessor {
  processQuery<T = unknown>(
    query: string,
    options?: QueryOptions<T>,
  ): Promise<QueryResult<T>>;
}

/**
 * IConversationContext Interface
 * Defines the contract for conversation contexts
 */
export interface IConversationContext {
  getConversationHistory(conversationId?: string): Promise<string>;
  saveTurn(
    query: string,
    response: string,
    options?: { userId?: string; metadata?: Record<string, unknown> },
  ): Promise<void>;
}

/**
 * Search Options
 * Options for entity search operations
 */
export interface SearchOptions {
  entityTypes?: string[];
  limit?: number;
  includeEmbeddings?: boolean;
  includeMetadata?: boolean;
  tags?: string[];
  dateRange?: {
    start?: string;
    end?: string;
  };
}

/**
 * Entity Adapter Interface
 * Defines the contract for entity adapters
 */
export interface EntityAdapter<T extends Entity> {
  fromMarkdown(markdown: string): T;
  toMarkdown(entity: T): string;
  validateEntity(entity: T): boolean;
  extractMetadata(entity: T): Record<string, unknown>;
  formatForPrompt(entity: T): string;
}

/**
 * Entity Service Interface
 * Defines the contract for the entity service
 */
export interface IEntityService {
  registerEntityType(type: string, adapter: EntityAdapter<any>): void;
  getAdapterForType(type: string): EntityAdapter<any>;
  createEntity(type: string, data: Partial<Entity>): Promise<Entity>;
  getEntity(id: string): Promise<Entity | null>;
  updateEntity(id: string, data: Partial<Entity>): Promise<Entity>;
  deleteEntity(id: string): Promise<boolean>;
  searchEntities(query: string, options?: SearchOptions): Promise<Entity[]>;
  getRelatedEntities(entityId: string, limit?: number): Promise<Entity[]>;
  saveEntityEmbedding(entityId: string, embedding: number[]): Promise<void>;
}

/**
 * Context Interface
 * Defines the contract for plugin contexts
 */
export interface IContext {
  getContextType(): string;
  supports(capability: string): boolean;
  getSchemas(): Record<string, z.ZodType<any>>;
}
