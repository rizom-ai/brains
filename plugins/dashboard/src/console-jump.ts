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

/**
 * Grouped doors for the cross-surface ⌘K palette. Entities open at canonical
 * Studio detail paths, so the group exists only when a Studio is registered; tabs
 * land on this dashboard's in-document group anchors.
 */
export function buildConsoleJumpGroups(options: {
  query: string;
  dashboardPath: string;
  studioPath: string | undefined;
  entities: ConsoleJumpEntityHit[];
}): ConsoleJumpGroup[] {
  const query = options.query.trim().toLowerCase();
  const result: ConsoleJumpGroup[] = [];

  if (
    options.studioPath !== undefined &&
    (query === "" || "people access identity".includes(query))
  ) {
    const studioPath =
      options.studioPath === "/" ? "" : options.studioPath.replace(/\/+$/, "");
    result.push({
      id: "surfaces",
      label: "Console",
      items: [
        {
          id: "surface/people",
          title: "People",
          sub: "Access and identity",
          href: `${studioPath}/workspaces/${encodeURIComponent("admin:people")}`,
          tag: "studio",
        },
      ],
    });
  }

  if (options.studioPath !== undefined && options.entities.length > 0) {
    const studioPath = options.studioPath;
    result.push({
      id: "entities",
      label: "Entities",
      items: options.entities.map((hit) => ({
        id: `${hit.entityType}/${hit.id}`,
        title: hit.title,
        sub: hit.entityType,
        href: `${studioPath === "/" ? "" : studioPath.replace(/\/+$/, "")}/entities/${encodeURIComponent(hit.entityType)}/${encodeURIComponent(hit.id)}`,
        tag: "edit in studio",
      })),
    });
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "knowledge", label: "Knowledge" },
    { id: "network", label: "Network" },
  ]
    .filter(
      ({ id, label }) =>
        query === "" ||
        label.toLowerCase().includes(query) ||
        id.includes(query),
    )
    .map(({ id, label }) => ({
      id: `tab/${id}`,
      title: label,
      sub: "tab",
      href: `${options.dashboardPath}#${id}`,
      tag: "dashboard",
    }));
  if (tabs.length > 0) {
    result.push({ id: "tabs", label: "Dashboard", items: tabs });
  }

  return result;
}
