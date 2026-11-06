import type { ConsoleSurface, SurfacePermissionLevel } from "@brains/contracts";
import type { WebRouteRole } from "@brains/contracts";
import { findRouteByRole, type RegisteredWebRoute } from "./types/web-routes";

export type { ConsoleSurface, SurfacePermissionLevel } from "@brains/contracts";

const PERMISSION_RANK: Record<SurfacePermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

/**
 * Console surfaces in strip order. A surface's door is the route claiming one
 * of its roles, the first role that any route claims; a brain whose plugins
 * claim none of them shows no such door. `visibility` is the minimum
 * permission level a caller needs to see the door, matching the permission
 * each surface enforces on its own route.
 */
const SURFACES: ReadonlyArray<{
  id: string;
  roles: readonly WebRouteRole[];
  /** A route the surface cannot work without; absent, it has no door. */
  requiresRole?: WebRouteRole;
  label: string;
  visibility: SurfacePermissionLevel;
  requiresActiveSession: boolean;
}> = [
  {
    id: "dashboard",
    roles: ["dashboard"],
    label: "Dashboard",
    visibility: "public",
    requiresActiveSession: false,
  },
  {
    id: "web-chat",
    // Studio's native chat, else the Ask page; either needs a chat backend.
    roles: ["studio-chat", "ask"],
    requiresRole: "chat-api",
    label: "Chat",
    visibility: "trusted",
    requiresActiveSession: true,
  },
  {
    id: "studio",
    roles: ["studio"],
    label: "Studio",
    visibility: "public",
    requiresActiveSession: true,
  },
];

export function deriveConsoleSurfaces(
  routes: readonly Pick<RegisteredWebRoute, "fullPath" | "definition">[],
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
    roles,
    requiresRole,
    label,
    visibility,
    requiresActiveSession,
  } of SURFACES) {
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
      : requiresRole && !findRouteByRole(routes, requiresRole)
        ? undefined
        : roles
            .map((role) => findRouteByRole(routes, role)?.fullPath)
            .find((path) => path !== undefined);
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
