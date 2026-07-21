export type CmsPathTarget =
  | { kind: "home" }
  | { kind: "collection"; entityType: string }
  | { kind: "entity"; entityType: string; id: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "not-found"; pathname: string };

/** Normalize the configured CMS mount for path formatting and matching. */
export function normalizeCmsBasePath(routePath: string): string {
  const withLeadingSlash = routePath.startsWith("/")
    ? routePath
    : `/${routePath}`;
  return withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/+$/, "");
}

export function cmsCollectionPath(
  routePath: string,
  entityType: string,
): string {
  return `${normalizeCmsBasePath(routePath)}/entities/${encodeURIComponent(entityType)}`;
}

export function cmsEntityPath(
  routePath: string,
  entityType: string,
  id: string,
): string {
  return `${cmsCollectionPath(routePath, entityType)}/${encodeURIComponent(id)}`;
}

export function cmsWorkspacePath(
  routePath: string,
  workspaceId: string,
): string {
  return `${normalizeCmsBasePath(routePath)}/workspaces/${encodeURIComponent(workspaceId)}`;
}

/** Parse one canonical CMS pathname, decoding every route value exactly once. */
export function parseCmsPath(
  pathname: string,
  routePath: string,
): CmsPathTarget {
  const base = normalizeCmsBasePath(routePath);
  const homePath = base || "/";
  if (pathname === homePath) return { kind: "home" };

  const prefix = base === "" ? "" : base;
  if (prefix !== "" && !pathname.startsWith(`${prefix}/`)) {
    return { kind: "not-found", pathname };
  }
  const relative = pathname.slice(prefix.length);

  try {
    const collectionMatch = /^\/entities\/([^/]+)$/.exec(relative);
    if (collectionMatch?.[1]) {
      return {
        kind: "collection",
        entityType: decodeURIComponent(collectionMatch[1]),
      };
    }

    const entityMatch = /^\/entities\/([^/]+)\/(.+)$/.exec(relative);
    if (entityMatch?.[1] && entityMatch[2] && !relative.endsWith("/")) {
      return {
        kind: "entity",
        entityType: decodeURIComponent(entityMatch[1]),
        id: decodeURIComponent(entityMatch[2]),
      };
    }

    const workspaceMatch = /^\/workspaces\/([^/]+)$/.exec(relative);
    if (workspaceMatch?.[1]) {
      return {
        kind: "workspace",
        workspaceId: decodeURIComponent(workspaceMatch[1]),
      };
    }
  } catch {
    // Malformed percent encoding is an invalid route, not an editor target.
  }

  return { kind: "not-found", pathname };
}
