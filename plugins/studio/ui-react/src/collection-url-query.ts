import { STUDIO_ENTITY_PAGE_LIMIT } from "../../src/editor-contracts";
import {
  studioCollectionQuerySchema,
  studioCollectionQueryFromParams,
  type StudioCollectionQuery,
} from "../../src/collection-query";

/** Invalid links fall back to defaults; offsets identify complete pages. */
export function collectionQuery(rawSearch: string): StudioCollectionQuery {
  const parsed = studioCollectionQuerySchema.safeParse(
    studioCollectionQueryFromParams(new URLSearchParams(rawSearch)),
  );
  const query = parsed.success
    ? parsed.data
    : studioCollectionQuerySchema.parse({});
  return {
    ...query,
    offset: Math.floor(query.offset / query.limit) * query.limit,
  };
}

export function collectionSearch(query: StudioCollectionQuery): string {
  const params = new URLSearchParams();
  if (query.prefix) params.set("prefix", JSON.stringify(query.prefix));
  if (query.scope !== "folder") params.set("scope", query.scope);
  if (query.offset > 0) params.set("offset", String(query.offset));
  if (query.limit !== STUDIO_ENTITY_PAGE_LIMIT)
    params.set("limit", String(query.limit));
  if (query.q) params.set("q", query.q);
  if (query.visibility !== "all") params.set("visibility", query.visibility);
  if (query.status) params.set("status", query.status);
  if (query.sort !== "updated-desc") params.set("sort", query.sort);
  const search = params.toString();
  return search ? `?${search}` : "";
}
