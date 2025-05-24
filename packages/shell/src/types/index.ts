import { z } from "zod";

/**
 * Base entity schema that all entity types must extend
 * Uses nanoid for IDs and includes all common fields
 */
export const baseEntitySchema = z.object({
  id: z.string().min(1), // nanoid(12) generated
  entityType: z.string(), // Type discriminator
  title: z.string(), // Display title
  content: z.string(), // Main content
  created: z.string().datetime(), // ISO timestamp
  updated: z.string().datetime(), // ISO timestamp
  tags: z.array(z.string()).default([]), // Tags array
});

export type BaseEntity = z.infer<typeof baseEntitySchema>;

/**
 * Content model interface
 * All entities must be able to represent themselves as markdown
 */
export interface IContentModel {
  // Convert entity to markdown representation
  toMarkdown(): string;
}

/**
 * Complete entity type - all entities must satisfy this
 */
export type Entity = BaseEntity & IContentModel;

/**
 * Search options schema for entity queries
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
 * Search result type
 */
export type SearchResult = {
  entity: BaseEntity & IContentModel;
  score: number;
  excerpt: string;
  highlights: string[];
};

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
): z.ZodSchema {
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
