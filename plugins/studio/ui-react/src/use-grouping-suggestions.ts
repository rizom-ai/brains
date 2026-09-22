import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { StudioGrouping } from "../../src/grouping-vocabulary-contract";
import { studioGroupingQuerySchema } from "../../src/grouping-query";
import { useStudioApi } from "./studio-api-context";
import { groupingQueryOptions } from "./grouping-queries";

/** The first catalog page: the same key the browse view uses, so it is shared. */
const CATALOG_QUERY = studioGroupingQuerySchema.parse({});

/**
 * Existing values for each grouping a type participates in, keyed by field.
 *
 * Membership matches exactly, so an editor that offers no existing values
 * invites "Acme", "ACME" and "Acme Inc." to become three separate groups.
 * These are advisory: a value that is still loading or unreadable simply
 * offers nothing, and typing a new value stays possible.
 */
export function useGroupingSuggestions(
  groupings: readonly StudioGrouping[],
): Record<string, readonly string[]> {
  const api = useStudioApi();
  const openGroupings = useMemo(
    () => groupings.filter((grouping) => !grouping.vocabulary),
    [groupings],
  );
  // One options instance per API and declaration set, as grouping-queries
  // documents: the initialization retry keeps its deadline in that instance.
  const queries = useMemo(
    () =>
      openGroupings.map((grouping) =>
        groupingQueryOptions(api, grouping.key, CATALOG_QUERY),
      ),
    [api, openGroupings],
  );
  const results = useQueries({ queries });
  const suggestions: Record<string, readonly string[]> = {};
  results.forEach((result, index) => {
    const grouping = openGroupings[index];
    // A failed refetch retains React Query's old data, including values the
    // current session may no longer read. Offer only successful results.
    if (grouping && result.isSuccess && result.data.kind === "catalog")
      suggestions[grouping.field] = result.data.values.map((row) => row.value);
  });
  // A stable identity while the catalogs are unchanged, so an open editor does
  // not re-render on every parent render.
  const signature = JSON.stringify(suggestions);
  return useMemo(
    (): Record<string, readonly string[]> => JSON.parse(signature),
    [signature],
  );
}
