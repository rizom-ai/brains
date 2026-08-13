import type { CmsWorkspaceInfo } from "./api";
import type { CmsWorkspaceQuery } from "./queries";

const TRANSIENT_WORKSPACE_QUERY_KEYS = new Set(["offset", "limit"]);

/** Hydrate stable URL fields only for workspaces that explicitly opt in. */
export function initialWorkspaceUrlQuery(
  workspace: Pick<CmsWorkspaceInfo, "urlQuery"> | undefined,
  rawSearch: string,
): CmsWorkspaceQuery {
  if (workspace?.urlQuery !== true) return {};
  const query: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawSearch)) {
    if (!TRANSIENT_WORKSPACE_QUERY_KEYS.has(key)) query[key] = value;
  }
  return query;
}

/** Serialize canonical workspace filters without transient paging state. */
export function workspaceUrlSearch(query: CmsWorkspaceQuery): string {
  const search = new URLSearchParams();
  const entries = Object.entries(query)
    .filter(
      ([key, value]) =>
        !TRANSIENT_WORKSPACE_QUERY_KEYS.has(key) &&
        value !== undefined &&
        (typeof value !== "number" || Number.isFinite(value)),
    )
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [key, value] of entries) search.set(key, String(value));
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export function workspaceUrlHref(
  pathname: string,
  query: CmsWorkspaceQuery,
): string {
  return `${pathname}${workspaceUrlSearch(query)}`;
}

/** Canonical filter changes replace their current history entry, never push. */
export function replaceWorkspaceUrlQuery(
  history: { replace(href: string): void },
  pathname: string,
  query: CmsWorkspaceQuery,
): void {
  history.replace(workspaceUrlHref(pathname, query));
}
