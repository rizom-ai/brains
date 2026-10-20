import { pLimit } from "@brains/utils/p-limit";
import type { PreparedRoute } from "./prepared-site-build";

/** How many pages a build renders at once. */
export const ROUTE_CONCURRENCY = 4;

/**
 * A build's pages, prepared a few at a time as they are rendered: a page is
 * dropped once its visit ends, so a build never holds all of its pages.
 */
export interface PreparedRouteSource {
  /** How many pages the build has. */
  readonly count: number;
  /**
   * Visit every page, a few at once and in no fixed order. Every visit runs
   * to its end; the first failure is then thrown.
   */
  each(
    visit: (route: PreparedRoute) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void>;
}

/**
 * Run a visit for each item, a few at once. Every visit runs to its end, so
 * none is still writing when the first failure is thrown.
 */
export async function visitEach<T>(
  items: readonly T[],
  visit: (item: T) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const limit = pLimit(ROUTE_CONCURRENCY);
  const results = await Promise.allSettled(
    items.map((item) =>
      limit(async () => {
        signal.throwIfAborted();
        await visit(item);
      }),
    ),
  );
  signal.throwIfAborted();
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rejected) throw rejected.reason;
}

/** A source over pages already prepared and held, as tests and small builds have them. */
export function routeSourceOf(
  routes: readonly PreparedRoute[],
): PreparedRouteSource {
  return {
    count: routes.length,
    each: (visit, signal) => visitEach(routes, visit, signal),
  };
}
