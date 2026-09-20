import { groupingValueLabel } from "./grouping-value";
import { isPlainRecord } from "@brains/utils/predicates";
import type { EntityGrouping } from "@brains/plugins";

export interface GroupingNavigation {
  items: readonly EntityGrouping[];
  active: string | null;
  onSelect: (key: string) => void;
}
import {
  studioGroupingQuerySchema,
  type StudioGroupingQuery,
} from "../../src/grouping-query";
import { parseStudioPath } from "../../src/studio-paths";

export function groupingQuery(search: string): StudioGroupingQuery {
  const parsed = studioGroupingQuerySchema.safeParse(
    Object.fromEntries(new URLSearchParams(search)),
  );
  return parsed.success ? parsed.data : studioGroupingQuerySchema.parse({});
}
export function groupingSearch(query: StudioGroupingQuery): string {
  const params = new URLSearchParams();
  if (query.value !== null) params.set("value", query.value);
  if (query.type) params.set("type", query.type);
  if (query.q) params.set("q", query.q);
  if (query.sort !== "updated-desc") params.set("sort", query.sort);
  if (query.offset) params.set("offset", String(query.offset));
  if (query.limit !== 50) params.set("limit", String(query.limit));
  const search = params.toString();
  return search ? `?${search}` : "";
}

export interface GroupingReturnTarget {
  path: string;
  label: string;
  grouping: string;
}
export function groupingReturnTarget(
  state: unknown,
  base: string,
  groupings: readonly { key: string; label: string }[],
): GroupingReturnTarget | null {
  if (!isPlainRecord(state)) return null;
  const path = state["studioGroupingPath"];
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  )
    return null;
  const url = new URL(path, "https://studio.invalid");
  const route = parseStudioPath(url.pathname, base);
  if (route.kind !== "grouping") return null;
  const descriptor = groupings.find((entry) => entry.key === route.grouping);
  if (!descriptor) return null;
  const query = groupingQuery(url.search);
  return {
    path: `${url.pathname}${groupingSearch(query)}`,
    label:
      query.value === null ? descriptor.label : groupingValueLabel(query.value),
    grouping: descriptor.key,
  };
}
