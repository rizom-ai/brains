import { z } from "zod";

/**
 * Base entity schema that all entities must extend
 */
export const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()).default([]),
  created: z.string().datetime(),
  updated: z.string().datetime(),
});

/**
 * Base entity type
 */
export type BaseEntity = z.infer<typeof baseEntitySchema>;


/**
 * Search result type
 */
export interface SearchResult {
  entity: BaseEntity;
  score: number;
  excerpt: string;
  highlights: string[];
}
