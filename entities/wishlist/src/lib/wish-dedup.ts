import { slugify } from "@brains/utils";
import type { WishEntity } from "../schemas/wish";

export interface WishSearchDeps {
  search: (
    query: string,
    options?: { types?: string[]; limit?: number },
  ) => Promise<Array<{ entity: WishEntity; score: number; excerpt: string }>>;
  getEntity: (entityType: string, id: string) => Promise<WishEntity | null>;
  similarityThreshold: number;
}

/**
 * Find an existing wish that matches the given title + description,
 * using semantic search with slug-based fallback.
 */
export async function findExistingWish(
  deps: WishSearchDeps,
  input: { title: string; description: string },
): Promise<WishEntity | null> {
  const query = `${input.title}: ${input.description}`;
  const results = await deps.search(query, { types: ["wish"], limit: 1 });

  const topResult = results[0];
  if (topResult && topResult.score >= deps.similarityThreshold) {
    return topResult.entity;
  }

  // Fall back to exact slug match
  const slug = slugify(input.title);
  return deps.getEntity("wish", slug);
}
