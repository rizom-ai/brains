import {
  GROUPING_MAX_PAGE_LIMIT,
  type EntityGroupingUsage,
} from "@brains/plugins";
import type { UseQueryOptions } from "@tanstack/react-query";
import { ApiError, type GroupingPage, type StudioApi } from "./api";
import {
  studioGroupingQuerySchema,
  type StudioGroupingQuery,
} from "../../src/grouping-query";

/** Cold 10k-entity fixture is gated at 30s; allow a finite 90s startup window. */
export const GROUPING_INITIALIZATION_WAIT_MS = 90000;
const scopes = new WeakMap<StudioApi, number>();
let nextScope = 0;
export type GroupingQueryKey<T = StudioGroupingQuery> = readonly [
  "studio",
  "groupings",
  number,
  string,
  T,
];
export function isGroupingsInitializing(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 503 &&
    error.code === "groupings_initializing"
  );
}
function timeoutError(): Error {
  return new Error("Collections are not ready yet. Try again.");
}

/** One options instance per mounted route/query. Consuming the signal also
 * cancels React Query's retryer on unmount; a new API/session gets a new key.
 */
export function groupingQueryOptions(
  api: StudioApi,
  grouping: string,
  query: StudioGroupingQuery,
  waitMs: number = GROUPING_INITIALIZATION_WAIT_MS,
): UseQueryOptions<GroupingPage, Error, GroupingPage, GroupingQueryKey> {
  const normalized = studioGroupingQuerySchema.parse(query);
  return groupingReadOptions(
    api,
    grouping,
    normalized,
    (signal) => api.fetchGrouping(grouping, normalized, signal),
    waitMs,
  );
}

/** Values may span batches, but each response's entry total is already distinct. */
export function groupingUsageQueryOptions(
  api: StudioApi,
  grouping: string,
  values: readonly string[],
  waitMs: number = GROUPING_INITIALIZATION_WAIT_MS,
): UseQueryOptions<
  EntityGroupingUsage,
  Error,
  EntityGroupingUsage,
  GroupingQueryKey<{ kind: "usage"; values: string[] }>
> {
  const query = { kind: "usage" as const, values: [...values] };
  return groupingReadOptions(
    api,
    grouping,
    query,
    async (signal): Promise<EntityGroupingUsage> => {
      const result: EntityGroupingUsage = { entries: 0, values: [] };
      for (
        let offset = 0;
        offset === 0 || offset < query.values.length;
        offset += GROUPING_MAX_PAGE_LIMIT
      ) {
        signal.throwIfAborted();
        const page = await api.fetchGroupingUsage(
          grouping,
          query.values.slice(offset, offset + GROUPING_MAX_PAGE_LIMIT),
          signal,
        );
        if (offset === 0) result.entries = page.entries;
        result.values.push(...page.values);
      }
      return result;
    },
    waitMs,
  );
}

function groupingReadOptions<T, TQuery>(
  api: StudioApi,
  grouping: string,
  normalized: TQuery,
  read: (signal: AbortSignal) => Promise<T>,
  waitMs: number,
): UseQueryOptions<T, Error, T, GroupingQueryKey<TQuery>> {
  let scope = scopes.get(api);
  if (scope === undefined) {
    scope = ++nextScope;
    scopes.set(api, scope);
  }
  let deadline: number | undefined;
  return {
    queryKey: ["studio", "groupings", scope, grouping, normalized],
    queryFn: async ({ signal }): Promise<T> => {
      deadline ??= Date.now() + waitMs;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timeoutError();
      const budget = AbortSignal.timeout(remaining);
      try {
        const result = await read(AbortSignal.any([signal, budget]));
        deadline = undefined;
        return result;
      } catch (error) {
        if (signal.aborted) {
          deadline = undefined;
          throw signal.reason;
        }
        if (budget.aborted) throw timeoutError();
        throw error;
      }
    },
    retry: (_count, error): boolean => {
      if (
        isGroupingsInitializing(error) &&
        deadline !== undefined &&
        Date.now() < deadline
      )
        return true;
      deadline = undefined;
      return false;
    },
    retryDelay: (_count, error): number => {
      const requested =
        error instanceof ApiError ? error.retryAfterMs : undefined;
      const delay =
        requested !== undefined && Number.isFinite(requested)
          ? requested
          : 1000;
      return Math.max(
        0,
        Math.min(
          5000,
          Math.max(10, delay),
          (deadline ?? Date.now()) - Date.now(),
        ),
      );
    },
    // No placeholder data: never carry another collection's results forward.
    staleTime: 0,
  };
}
