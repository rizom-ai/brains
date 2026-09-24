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
export type GroupingQueryKey = readonly [
  "studio",
  "groupings",
  number,
  string,
  StudioGroupingQuery,
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
  let scope = scopes.get(api);
  if (scope === undefined) {
    scope = ++nextScope;
    scopes.set(api, scope);
  }
  const normalized = studioGroupingQuerySchema.parse(query);
  let deadline: number | undefined;
  return {
    queryKey: ["studio", "groupings", scope, grouping, normalized],
    queryFn: async ({ signal }): Promise<GroupingPage> => {
      deadline ??= Date.now() + waitMs;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timeoutError();
      const budget = AbortSignal.timeout(remaining);
      try {
        const result = await api.fetchGrouping(
          grouping,
          normalized,
          AbortSignal.any([signal, budget]),
        );
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
