import { z } from "zod";

/**
 * Base entity schema that all entities must extend
 */
export const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Base entity type
 */
export type BaseEntity = z.infer<typeof baseEntitySchema>;

/**
 * Entity input type for creation - allows partial entities with optional system fields
 */
export type EntityInput<T extends BaseEntity> = Omit<
  T,
  "id" | "created" | "updated"
> & {
  id?: string;
  created?: string;
  updated?: string;
};

/**
 * Search result type
 */
export interface SearchResult {
  entity: BaseEntity;
  score: number;
  excerpt: string;
  highlights: string[];
}
