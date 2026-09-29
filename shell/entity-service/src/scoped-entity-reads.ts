import type {
  ContentVisibility,
  ICoreEntityService,
  ListOptions,
} from "./types";

/** What a scoped read view limits every read to. */
export interface EntityReadScope {
  /** Only what each type counts as published. */
  publishedOnly?: boolean | undefined;
  /** No wider than this visibility. */
  visibilityScope?: ContentVisibility | undefined;
}

type ScopedReads = Pick<
  ICoreEntityService,
  | "listEntities"
  | "countEntities"
  | "getEntity"
  | "search"
  | "getEntityCounts"
  | "getEntityTypes"
>;

/**
 * A read view of an entity service for people who may see only part of a
 * brain — a production site build, a visitor. Listings, counts, lookups and
 * search all apply the scope; the configured values win over a caller's, so
 * code handed the view cannot widen it. Explicit status filters intersect the
 * publish gate; a conflicting filter returns no records rather than bypassing it.
 */
export function scopeEntityReads<T extends ScopedReads>(
  base: T,
  scope: EntityReadScope,
): T {
  const { publishedOnly, visibilityScope } = scope;
  if (!publishedOnly && !visibilityScope) return base;

  const scopedFilter = (
    filter: ListOptions["filter"] | undefined,
  ): ListOptions["filter"] | undefined =>
    visibilityScope ? { ...filter, visibilityScope } : filter;

  const scopedListOptions = (options: ListOptions | undefined): ListOptions => {
    const filter = scopedFilter(options?.filter);
    return {
      ...options,
      ...(publishedOnly && { publishedOnly: true }),
      ...(filter && { filter }),
    };
  };

  return new Proxy(base, {
    get(target, prop, receiver): unknown {
      if (prop === "listEntities") {
        return (request: Parameters<ScopedReads["listEntities"]>[0]) =>
          target.listEntities({
            entityType: request.entityType,
            options: scopedListOptions(request.options),
          });
      }
      if (prop === "countEntities") {
        return (request: Parameters<ScopedReads["countEntities"]>[0]) =>
          target.countEntities({
            entityType: request.entityType,
            options: scopedListOptions(request.options),
          });
      }
      if (prop === "getEntity") {
        return (request: Parameters<ScopedReads["getEntity"]>[0]) =>
          // The configured scope always replaces the caller's; unset, the
          // store fails closed to public.
          target.getEntity({
            ...request,
            visibilityScope,
            ...(publishedOnly && { publishedOnly: true }),
          });
      }
      if (prop === "search") {
        return (request: Parameters<ScopedReads["search"]>[0]) =>
          target.search({
            ...request,
            options: {
              ...request.options,
              ...(visibilityScope && { visibilityScope }),
              ...(publishedOnly && { publishedOnly: true }),
            },
          });
      }
      if (prop === "getEntityCounts") {
        return async (callerScope?: ContentVisibility) => {
          const countScope = visibilityScope ?? callerScope;
          if (!publishedOnly) return target.getEntityCounts(countScope);
          const counts = await Promise.all(
            target.getEntityTypes().map(async (entityType) => ({
              entityType,
              count: await target.countEntities({
                entityType,
                options: {
                  publishedOnly: true,
                  ...(countScope && {
                    filter: { visibilityScope: countScope },
                  }),
                },
              }),
            })),
          );
          return counts.filter(({ count }) => count > 0);
        };
      }
      // Everything else reads through, bound so class methods keep `this`.
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
