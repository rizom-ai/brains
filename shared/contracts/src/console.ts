/**
 * Console-chrome contract shared by the surface derivation (in
 * `@brains/plugins`, which owns the web-route registry the doors derive from)
 * and the strip rendering (in `@brains/console-theme`, which stays a token
 * sheet with no knowledge of plugins or permissions).
 */

/** One door in the console strip's surface nav. */
export interface ConsoleSurface {
  id: string;
  label: string;
  href: string;
  isActive: boolean;
  /** Omitted for public surfaces that do not require authenticated state. */
  requiresActiveSession?: true | undefined;
}

/** Console permission levels, lowest to highest. */
export type SurfacePermissionLevel = "public" | "trusted" | "admin";
