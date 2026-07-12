export const DASHBOARD_GROUP_ORDER = [
  "knowledge",
  "publishing",
  "site",
  "network",
  "system",
] as const;

const GROUP_LABELS: Record<string, string> = {
  knowledge: "Knowledge",
  publishing: "Publishing",
  site: "Site",
  network: "Network",
  system: "System",
};

export function getDashboardGroupLabel(group: string): string {
  const label = GROUP_LABELS[group];
  if (label) return label;

  return group
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function sortDashboardGroups(groups: string[]): string[] {
  const order = new Map<string, number>(
    DASHBOARD_GROUP_ORDER.map((group, index) => [group, index]),
  );

  return [...groups].sort((a, b) => {
    const aOrder = order.get(a);
    const bOrder = order.get(b);

    if (aOrder !== undefined || bOrder !== undefined) {
      return (
        (aOrder ?? Number.MAX_SAFE_INTEGER) -
        (bOrder ?? Number.MAX_SAFE_INTEGER)
      );
    }

    return getDashboardGroupLabel(a).localeCompare(getDashboardGroupLabel(b));
  });
}
