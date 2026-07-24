/** One door in the console strip's surface nav. */
export interface ConsoleSurface {
  id: string;
  label: string;
  href: string;
  isActive: boolean;
}

/**
 * Structural view of a registered web route — matches
 * RegisteredWebRoute from @brains/plugins without depending on it.
 */
export interface ConsoleRouteLike {
  pluginId: string;
  fullPath: string;
}

/** Console permission levels, lowest to highest. */
export type SurfacePermissionLevel = "public" | "trusted" | "admin";

const PERMISSION_RANK: Record<SurfacePermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

/**
 * Console surfaces in strip order. A surface's link exists exactly when its
 * plugin registered a web route — a brain without the CMS plugin shows no CMS
 * door, mirroring how dashboard tabs derive from widget groups. `visibility`
 * is the minimum permission level a caller needs to see the door, matching the
 * permission each surface enforces on its own route.
 */
const SURFACE_PLUGINS: ReadonlyArray<{
  id: string;
  pluginId: string;
  label: string;
  visibility: SurfacePermissionLevel;
}> = [
  {
    id: "dashboard",
    pluginId: "dashboard",
    label: "Dashboard",
    visibility: "public",
  },
  {
    id: "web-chat",
    pluginId: "web-chat",
    label: "Chat",
    visibility: "trusted",
  },
  { id: "cms", pluginId: "cms", label: "CMS", visibility: "admin" },
  { id: "admin", pluginId: "admin", label: "Admin", visibility: "admin" },
  {
    id: "account",
    pluginId: "account",
    label: "Account",
    visibility: "public",
  },
];

export function deriveConsoleSurfaces(
  routes: ConsoleRouteLike[],
  options: {
    /** Plugin id of the surface rendering the strip (gets `is-active`). */
    activeId: string;
    /**
     * The caller's permission level. Surfaces above it are omitted so a
     * Trusted caller never sees an Admin-only door. Fails closed to `public`
     * when unspecified.
     */
    permissionLevel?: SurfacePermissionLevel;
    /**
     * The rendering surface's own door. A surface always shows itself even
     * when it cannot read its own registration back, and regardless of the
     * caller's level — the caller reached this surface through its own gate.
     */
    self?: { id: string; href: string };
  },
): ConsoleSurface[] {
  const callerRank = PERMISSION_RANK[options.permissionLevel ?? "public"];
  const surfaces: ConsoleSurface[] = [];

  for (const { id, pluginId, label, visibility } of SURFACE_PLUGINS) {
    const isSelf = options.self?.id === id;
    if (!isSelf && callerRank < PERMISSION_RANK[visibility]) {
      continue;
    }
    const door = isSelf
      ? options.self?.href
      : routes
          .filter((route) => route.pluginId === pluginId)
          .map((route) => route.fullPath)
          .sort((a, b) => a.length - b.length)[0];
    if (door !== undefined) {
      surfaces.push({
        id,
        label,
        href: door,
        isActive: id === options.activeId,
      });
    }
  }

  return surfaces;
}
