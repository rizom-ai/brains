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
  "projectSemanticSpace" | "getEntity"
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
  const projection = await entityService
    .projectSemanticSpace({ types: query.types, origin: query.origin })
    // A brain without embeddings has nothing related; callers render without.
    .catch(() => null);
  if (!projection) return [];

  const nearest = projection.points
    .filter((point) => point.distanceToOrigin <= query.maxDistance)
    .sort((a, b) => a.distanceToOrigin - b.distanceToOrigin)
    .slice(0, query.limit);
  const entries = await Promise.all(
    nearest.map(async (point) => {
      const entity = await entityService.getEntity({
        entityType: point.entityType,
        id: point.entityId,
      });
      return entity
        ? {
            entity,
            title: entityTitle(entity) ?? entity.id,
            slug: slugOf(entity),
            distance: point.distanceToOrigin,
          }
        : null;
    }),
  );
  return entries.filter((entry): entry is RelatedEntity => entry !== null);
}
