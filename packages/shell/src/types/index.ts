import { z } from "zod";
import type { BaseEntity } from "@brains/types";

/**
 * Complete entity type - all entities must satisfy this
 */
export type Entity = BaseEntity;

/**
 * Search options schema for entity queries - shell-specific
 */
export const searchOptionsSchema = z.object({
  types: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().positive().default(20),
  offset: z.number().nonnegative().default(0),
  sortBy: z.enum(["relevance", "created", "updated"]).default("relevance"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

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
 * Citation for referencing entities in responses
 */
export interface Citation {
  entityId: string;
  entityType: string;
  entityTitle: string;
  excerpt: string;
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
 * Query processing result
 */
export interface QueryResult<T> {
  answer: string;
  citations: Citation[];
  relatedEntities: Entity[];
  object: T;
}

/**
 * Serializable versions of types for API responses
 */
export const serializableEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  tags: z.array(z.string()),
});

export type SerializableEntity = z.infer<typeof serializableEntitySchema>;

export const serializableCitationSchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  entityTitle: z.string(),
  excerpt: z.string(),
});

export type SerializableCitation = z.infer<typeof serializableCitationSchema>;

export function serializableQueryResultSchema<T extends z.ZodTypeAny>(
  objectSchema: T,
): ReturnType<typeof z.object> {
  return z.object({
    answer: z.string(),
    citations: z.array(serializableCitationSchema),
    relatedEntities: z.array(serializableEntitySchema),
    object: objectSchema,
  });
}

export type SerializableQueryResult<T> = {
  answer: string;
  citations: SerializableCitation[];
  relatedEntities: SerializableEntity[];
  object: T;
};

/**
 * Model response from AI models
 */
export interface ModelResponse<T> {
  object: T;
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
