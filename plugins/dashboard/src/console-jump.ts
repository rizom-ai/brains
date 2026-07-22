import { getDashboardGroupLabel, sortDashboardGroups } from "./widget-groups";

export interface ConsoleJumpItem {
  id: string;
  title: string;
  sub?: string;
  href: string;
  tag?: string;
}

export interface ConsoleJumpGroup {
  id: string;
  label: string;
  items: ConsoleJumpItem[];
}

export interface ConsoleJumpEntityHit {
  entityType: string;
  id: string;
  title: string;
}

function anchorForGroup(group: string): string {
  const slug = group
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "group";
}

/**
 * Grouped doors for the cross-surface ⌘K palette. Entities open at canonical
 * CMS detail paths, so the group exists only when a CMS is registered; tabs
 * land on this dashboard's in-document group anchors.
 */
export function buildConsoleJumpGroups(options: {
  query: string;
  groups: string[];
  dashboardPath: string;
  cmsPath: string | undefined;
  adminPath?: string | undefined;
  entities: ConsoleJumpEntityHit[];
}): ConsoleJumpGroup[] {
  const query = options.query.trim().toLowerCase();
  const result: ConsoleJumpGroup[] = [];

  if (
    options.adminPath !== undefined &&
    (query === "" || "admin people access identity".includes(query))
  ) {
    result.push({
      id: "surfaces",
      label: "Console",
      items: [
        {
          id: "surface/admin",
          title: "Admin",
          sub: "People, access and identity",
          href: options.adminPath,
          tag: "console",
        },
      ],
    });
  }

  if (options.cmsPath !== undefined && options.entities.length > 0) {
    const cmsPath = options.cmsPath;
    result.push({
      id: "entities",
      label: "Entities",
      items: options.entities.map((hit) => ({
        id: `${hit.entityType}/${hit.id}`,
        title: hit.title,
        sub: hit.entityType,
        href: `${cmsPath === "/" ? "" : cmsPath.replace(/\/+$/, "")}/entities/${encodeURIComponent(hit.entityType)}/${encodeURIComponent(hit.id)}`,
        tag: "edit in cms",
      })),
    });
  }

  const tabs = sortDashboardGroups([...new Set(options.groups)])
    .map((group) => ({ group, label: getDashboardGroupLabel(group) }))
    .filter(
      ({ group, label }) =>
        query === "" ||
        label.toLowerCase().includes(query) ||
        group.toLowerCase().includes(query),
    )
    .map(({ group, label }) => ({
      id: `tab/${group}`,
      title: label,
      sub: "tab",
      href: `${options.dashboardPath}#${anchorForGroup(group)}`,
      tag: "dashboard",
    }));
  if (tabs.length > 0) {
    result.push({ id: "tabs", label: "Dashboard", items: tabs });
  }

  return result;
}
