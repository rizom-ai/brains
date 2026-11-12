import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import type { ServiceEntityReads } from "@brains/sdk/internal/service-runtime";
import type { z } from "@brains/utils/zod";
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
 * The read a site's data source makes here: its fetch context's scoped
 * entity service offers it, as a first-party service's entity reads do.
 */
export type RecentEntityReader = Pick<ServiceEntityReads, "listEntities">;

/** Fetch the most recent published entities of a type, newest first. */
export async function fetchRecentEntities<
  E extends BaseEntity & EntityWithPublishedAt,
  D,
>(
  entityService: RecentEntityReader,
  params: {
    entityType: string;
    entitySchema: z.ZodType<E, unknown>;
    count: number;
    parse: (entity: E) => D;
  },
): Promise<D[]> {
  const records = await entityService.listEntities({
    entityType: params.entityType,
    options: { limit: 20 },
  });
  return records
    .map((record) => params.entitySchema.parse(record))
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
