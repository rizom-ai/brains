import type { RegisteredWebRoute } from "@brains/plugins";

/** One door in the console strip's surface nav. */
export interface ConsoleSurface {
  id: string;
  label: string;
  href: string;
  isActive: boolean;
}

/**
 * Operator surfaces in strip order. A surface's link exists exactly when its
 * plugin registered a web route — a brain without the CMS plugin shows no CMS
 * door, mirroring how dashboard tabs derive from widget groups.
 */
const SURFACE_PLUGINS = [
  { id: "web-chat", label: "Chat" },
  { id: "cms", label: "CMS" },
] as const;

export function deriveConsoleSurfaces(
  routes: RegisteredWebRoute[],
  dashboardPath: string,
): ConsoleSurface[] {
  const surfaces: ConsoleSurface[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: dashboardPath,
      isActive: true,
    },
  ];

  for (const { id, label } of SURFACE_PLUGINS) {
    const door = routes
      .filter((route) => route.pluginId === id)
      .map((route) => route.fullPath)
      .sort((a, b) => a.length - b.length)[0];
    if (door !== undefined) {
      surfaces.push({ id, label, href: door, isActive: false });
    }
  }

  return surfaces;
}
