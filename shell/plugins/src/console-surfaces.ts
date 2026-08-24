import type { ConsoleSurface, SurfacePermissionLevel } from "@brains/contracts";
import type { RegisteredWebRoute } from "./types/web-routes";

export type { ConsoleSurface, SurfacePermissionLevel } from "@brains/contracts";

const PERMISSION_RANK: Record<SurfacePermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

/**
 * Console surfaces in strip order. A surface's link exists exactly when its
 * plugin registered a web route — a brain without the Studio plugin shows no Studio
 * door, mirroring how dashboard tabs derive from widget groups. `visibility`
 * is the minimum permission level a caller needs to see the door, matching the
 * permission each surface enforces on its own route.
 *
 * This table names the console plugins and their permission tiers in one
 * place; the eventual end state is each plugin declaring its own surface
 * descriptor at route registration, which is HTTP-route-registry work and
 * governed by that plan — until then, the table lives here, next to the
 * route registry it reads, rather than in the theme package.
 */
const SURFACE_PLUGINS: ReadonlyArray<{
  id: string;
  pluginId: string;
  label: string;
  visibility: SurfacePermissionLevel;
  requiresActiveSession: boolean;
}> = [
  {
    id: "dashboard",
    pluginId: "dashboard",
    label: "Dashboard",
    visibility: "public",
    requiresActiveSession: false,
  },
  {
    id: "web-chat",
    pluginId: "web-chat",
    label: "Chat",
    visibility: "trusted",
    requiresActiveSession: true,
  },
  {
    id: "studio",
    pluginId: "studio",
    label: "Studio",
    visibility: "public",
    requiresActiveSession: true,
  },
  {
    id: "admin",
    pluginId: "admin",
    label: "Admin",
    visibility: "admin",
    requiresActiveSession: true,
  },
  {
    id: "account",
    pluginId: "account",
    label: "Account",
    visibility: "public",
    requiresActiveSession: true,
  },
];

export function deriveConsoleSurfaces(
  routes: Pick<RegisteredWebRoute, "pluginId" | "fullPath">[],
  options: {
    /** Plugin id of the surface rendering the strip (gets `is-active`). */
    activeId: string;
    /**
     * The caller's permission level. Surfaces above it are omitted so a
     * Trusted caller never sees an Admin-only door. Fails closed to `public`
     * when unspecified.
     */
    permissionLevel?: SurfacePermissionLevel;
    /** Whether the caller has a verified active session. */
    hasActiveSession?: boolean;
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

  for (const {
    id,
    pluginId,
    label,
    visibility,
    requiresActiveSession,
  } of SURFACE_PLUGINS) {
    const isSelf = options.self?.id === id;
    if (
      !isSelf &&
      (callerRank < PERMISSION_RANK[visibility] ||
        (requiresActiveSession && options.hasActiveSession !== true))
    ) {
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
        ...(requiresActiveSession ? { requiresActiveSession: true } : {}),
      });
    }
  }

  return surfaces;
}
