import type { BaseEntity } from "@brains/sdk/entities";
import {
  sortByPublicationDate,
  type EntityWithPublishedAt,
} from "@brains/utils/sort";
import type { SiteInfoCTA } from "@brains/site-composition";

/**
 * Shared building blocks for site homepage/about datasources.
 *
 * The per-site datasources differ in which entities they surface and the
 * shape they return; these helpers cover the fetch/guard steps every site
 * repeats, so each datasource is left with only its own composition.
 * Profile fetch+parse is covered by `fetchAnchorProfileData` in
 * `@brains/profile`.
 */

/**
 * The one read these helpers make. Structural rather than the datasource
 * context's whole entity service, so a site datasource and a test both
 * satisfy it.
 */
interface DataSourceEntityService {
  listEntities<T extends BaseEntity>(request: {
    entityType: string;
    options?: { limit?: number } | undefined;
  }): Promise<T[]>;
}

/** Fetch the most recent published entities of a type, newest first. */
export async function fetchRecentEntities<
  E extends BaseEntity & EntityWithPublishedAt,
  D,
>(
  entityService: DataSourceEntityService,
  params: { entityType: string; count: number; parse: (entity: E) => D },
): Promise<D[]> {
  const entities = await entityService.listEntities<E>({
    entityType: params.entityType,
    options: { limit: 20 },
  });
  return entities
    .sort(sortByPublicationDate)
    .slice(0, params.count)
    .map(params.parse);
}

/** A homepage requires a configured CTA; surface a clear error if it is missing. */
export function requireCta(cta: SiteInfoCTA | undefined): SiteInfoCTA {
  if (!cta) {
    throw new Error("CTA not configured in site-info");
  }
  return cta;
}
