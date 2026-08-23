export type StudioPathTarget =
  | { kind: "home" }
  | { kind: "collection"; entityType: string }
  | { kind: "entity"; entityType: string; id: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "not-found"; pathname: string };

/** Normalize the configured Studio mount for path formatting and matching. */
export function normalizeStudioBasePath(routePath: string): string {
  const withLeadingSlash = routePath.startsWith("/")
    ? routePath
    : `/${routePath}`;
  return withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/+$/, "");
}

export function studioCollectionPath(
  routePath: string,
  entityType: string,
): string {
  return `${normalizeStudioBasePath(routePath)}/entities/${encodeURIComponent(entityType)}`;
}

export function studioEntityPath(
  routePath: string,
  entityType: string,
  id: string,
): string {
  return `${studioCollectionPath(routePath, entityType)}/${encodeURIComponent(id)}`;
}

export function studioCreatePath(
  routePath: string,
  entityType: string,
): string {
  const url = new URL(
    studioCollectionPath(routePath, entityType),
    "https://brains.invalid",
  );
  url.searchParams.set("mode", "create");
  return `${url.pathname}${url.search}`;
}

export function studioWorkspacePath(
  routePath: string,
  workspaceId: string,
): string {
  return `${normalizeStudioBasePath(routePath)}/workspaces/${encodeURIComponent(workspaceId)}`;
}

/** Parse one canonical Studio pathname, decoding every route value exactly once. */
export function parseStudioPath(
  pathname: string,
  routePath: string,
): StudioPathTarget {
  const base = normalizeStudioBasePath(routePath);
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
