import { z } from "@brains/utils";
import type { BaseEntity } from "@brains/entity-service";

/**
 * Complete entity type - all entities must satisfy this
 */
export type Entity = BaseEntity;

/**
 * App info schema - brain application metadata
 * Used for introspection and about information
 */
export const appInfoSchema = z.object({
  model: z.string(),
  version: z.string(),
});

export type AppInfo = z.infer<typeof appInfoSchema>;

/**
 * Search options schema for entity queries - shell-specific
 */
export const searchOptionsSchema = z.object({
  types: z.array(z.string()).optional(),
  excludeTypes: z.array(z.string()).optional(),
  limit: z.number().positive().default(20),
  offset: z.number().nonnegative().default(0),
  sortBy: z.enum(["relevance", "created", "updated"]).default("relevance"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type SearchOptions = z.input<typeof searchOptionsSchema>;

/**
 * Intent analysis result for query processing
 */
export interface IntentAnalysis {
  primaryIntent: string;
  entityTypes: string[];
  shouldSearchExternal?: boolean;
  confidenceScore: number;
}

/**
 * Query processing options
 */
export interface QueryOptions<T> {
  userId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  schema: z.ZodType<T>;
}

/**
 * Query processing result is now just the schema type
 * This allows complete flexibility in what queries return
 */
export type QueryResult<T> = T;

/**
 * Serializable versions of types for API responses
 */
export const serializableEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
});

export type SerializableEntity = z.infer<typeof serializableEntitySchema>;

/**
 * Serializable query result is now just the schema type itself
 */
export type SerializableQueryResult<T> = T;

/**
 * Model response from AI models
 */
export interface ModelResponse<T> {
  object: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
