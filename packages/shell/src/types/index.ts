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
  id: string;
  entityType: string;
  tags: string[];
  created: string;
  updated: string;
  score: number;
  entity: BaseEntity & IContentModel;
};
