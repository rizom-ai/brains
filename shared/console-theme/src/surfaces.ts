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

/**
 * Operator surfaces in strip order. A surface's link exists exactly when its
 * plugin registered a web route — a brain without the CMS plugin shows no CMS
 * door, mirroring how dashboard tabs derive from widget groups.
 */
const SURFACE_PLUGINS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "web-chat", label: "Chat" },
  { id: "cms", label: "CMS" },
] as const;

export function deriveConsoleSurfaces(
  routes: ConsoleRouteLike[],
  options: {
    /** Plugin id of the surface rendering the strip (gets `is-active`). */
    activeId: string;
    /**
     * The rendering surface's own door. A surface always shows itself even
     * when it cannot read its own registration back.
     */
    self?: { id: string; href: string };
  },
): ConsoleSurface[] {
  const surfaces: ConsoleSurface[] = [];

  for (const { id, label } of SURFACE_PLUGINS) {
    const door =
      options.self?.id === id
        ? options.self.href
        : routes
            .filter((route) => route.pluginId === id)
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
