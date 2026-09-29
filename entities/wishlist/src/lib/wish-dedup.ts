import { findNearestEntity, type NearestEntityDeps } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import type { WishEntity } from "../schemas/wish";

/**
 * Cosine distance between wish markdowns within which they ask for the same
 * thing. Measured rewordings of one wish sit at 0.19–0.22, a related but
 * different wish at 0.36, unrelated wishes beyond 0.4.
 */
export const SAME_WISH_DISTANCE = 0.28;

export interface WishSearchDeps extends NearestEntityDeps<WishEntity> {
  maxDistance: number;
}

/**
 * Find an existing wish that asks for what the new wish's markdown asks for,
 * by embedding distance, falling back to an exact slug match.
 */
export async function findExistingWish(
  deps: WishSearchDeps,
  input: { title: string; content: string },
): Promise<WishEntity | null> {
  const nearest = await findNearestEntity(deps, {
    query: input.content,
    entityType: "wish",
    maxDistance: deps.maxDistance,
    visibility: "public",
  });
  if (nearest) return nearest;

  return deps.getEntity({
    entityType: "wish",
    id: slugify(input.title),
  });
}
