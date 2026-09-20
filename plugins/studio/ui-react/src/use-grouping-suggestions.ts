import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { EntityGrouping } from "@brains/plugins";
import { studioGroupingQuerySchema } from "../../src/grouping-query";
import { useStudioApi } from "./studio-api-context";
import { groupingQueryOptions } from "./grouping-queries";

/**
 * Existing values for each grouping a type participates in, keyed by field.
 *
 * Membership matches exactly, so an editor that offers no existing values
 * invites "Acme", "ACME" and "Acme Inc." to become three separate groups.
 * These are advisory: a value that is still loading or unreadable simply
 * offers nothing, and typing a new value stays possible.
 */
export function useGroupingSuggestions(
  groupings: readonly EntityGrouping[],
): Record<string, readonly string[]> {
  const api = useStudioApi();
  const catalog = studioGroupingQuerySchema.parse({});
  const results = useQueries({
    queries: groupings.map((grouping) =>
      groupingQueryOptions(api, grouping.key, catalog),
    ),
  });
  const suggestions: Record<string, readonly string[]> = {};
  results.forEach((result, index) => {
    const grouping = groupings[index];
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
