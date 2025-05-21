import { z } from 'zod';

/**
 * Base entity schema that all entity types must extend
 */
export const baseEntitySchema = z.object({
  id: z.string().uuid(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  tags: z.array(z.string()).default([]),
  entityType: z.string(),
});

export type BaseEntity = z.infer<typeof baseEntitySchema>;

/**
 * Content model interface 
 * All entities must be able to represent themselves as markdown
 * and be constructed from markdown
 */
export interface IContentModel extends BaseEntity {
  // Convert entity to markdown representation
  toMarkdown(): string;
}

/**
 * Search options schema for entity queries
 */
export const searchOptionsSchema = z.object({
  types: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().positive().default(20),
  offset: z.number().nonnegative().default(0),
  sortBy: z.enum(['relevance', 'created', 'updated']).default('relevance'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
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