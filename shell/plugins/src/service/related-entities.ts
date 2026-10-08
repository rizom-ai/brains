import type {
  BaseEntity,
  IEntityService,
  SemanticEntityReference,
} from "@brains/entity-service";
import { entityTitle } from "@brains/entity-service";

/** What to look for near an entry. */
export interface RelatedEntitiesQuery {
  origin: SemanticEntityReference;
  /** Entity types to consider. */
  types: string[];
  /** Cosine distance beyond which an entry is not related. */
  maxDistance: number;
  limit: number;
}

/** An entry near the origin, named and measured. */
export interface RelatedEntity {
  entity: BaseEntity;
  /** Its metadata title, its frontmatter title, or its id. */
  title: string;
  slug: string | null;
  distance: number;
}

/** The two reads the lookup needs; datasource contexts provide both. */
export type RelatedEntityReader = Pick<
  IEntityService,
  "nearestToEntity" | "getEntity"
>;

function slugOf(entity: BaseEntity): string | null {
  const slug = entity.metadata["slug"];
  return typeof slug === "string" ? slug : null;
}

/**
 * The entries nearest an origin by their stored embeddings, closest first.
 * It makes no embedding API calls, and both reads fail closed to public
 * entries, so a public page never surfaces a private one.
 */
export async function findRelatedEntities(
  entityService: RelatedEntityReader,
  query: RelatedEntitiesQuery,
): Promise<RelatedEntity[]> {
  const nearest = await entityService
    .nearestToEntity({
      origin: query.origin,
      types: query.types,
      maxDistance: query.maxDistance,
      limit: query.limit,
    })
    .catch((error: unknown) => {
      // Only disabled indexing is optional presentation, not a database failure.
      if (
        error instanceof Error &&
        error.message ===
          "Semantic indexing is disabled for this Brain instance"
      )
        return [];
      throw error;
    });

  const entries = await Promise.all(
    nearest.map(async (match) => {
      const entity = await entityService.getEntity({
        entityType: match.entityType,
        id: match.entityId,
      });
      return entity
        ? {
            entity,
            title: entityTitle(entity) ?? entity.id,
            slug: slugOf(entity),
            distance: match.distance,
          }
        : null;
    }),
  );
  return entries.filter((entry): entry is RelatedEntity => entry !== null);
}
