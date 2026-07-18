/** @jsxImportSource preact */
import type { JSX } from "preact";
import { getDashboardGroupLabel, sortDashboardGroups } from "../widget-groups";
import type { RenderableWidgetData } from "./types";

export interface WidgetGroups {
  primary: RenderableWidgetData[];
  secondary: RenderableWidgetData[];
  sidebar: RenderableWidgetData[];
}

export interface WidgetTab {
  id: string;
  group: string;
  label: string;
  widgets: WidgetGroups;
  widgetCount: number;
  needsAttention: number;
}

function createEmptyWidgetGroups(): WidgetGroups {
  return {
    primary: [],
    secondary: [],
    sidebar: [],
  };
}

export function getTabWidgets(tab: WidgetTab): RenderableWidgetData[] {
  return [
    ...tab.widgets.primary,
    ...tab.widgets.secondary,
    ...tab.widgets.sidebar,
  ];
}

export function countTabWidgets(tab: WidgetTab): number {
  return getTabWidgets(tab).length;
}

function countNeedsAttention(tab: WidgetTab): number {
  return getTabWidgets(tab).reduce(
    (total, widget) => total + (widget.widget.needsAttention ?? 0),
    0,
  );
}

function anchorForGroup(group: string): string {
  const slug = group
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "group";
}

export function buildDashboardTabs(
  widgets: Record<string, RenderableWidgetData>,
): WidgetTab[] {
  const groupedWidgets = new Map<string, WidgetGroups>();

  for (const widget of Object.values(widgets)) {
    const group = widget.widget.group;
    const sectionWidgets =
      groupedWidgets.get(group) ?? createEmptyWidgetGroups();
    sectionWidgets[widget.widget.section].push(widget);
    groupedWidgets.set(group, sectionWidgets);
  }

  for (const groups of groupedWidgets.values()) {
    for (const section of Object.keys(groups) as Array<keyof WidgetGroups>) {
      groups[section].sort((a, b) => a.widget.priority - b.widget.priority);
    }
  }

  const usedAnchors = new Map<string, number>();

  // Tabs with dashboard built-ins exist even without registered widgets:
  // knowledge (entity summary) and system (index/sync/jobs/runtime).
  for (const builtInGroup of ["knowledge", "system"]) {
    if (!groupedWidgets.has(builtInGroup)) {
      groupedWidgets.set(builtInGroup, createEmptyWidgetGroups());
    }
  }

  return sortDashboardGroups(Array.from(groupedWidgets.keys())).map((group) => {
    const baseAnchor = anchorForGroup(group);
    const anchorCount = usedAnchors.get(baseAnchor) ?? 0;
    const widgetsForGroup =
      groupedWidgets.get(group) ?? createEmptyWidgetGroups();
    const tabWithoutCounts = {
      id: anchorCount === 0 ? baseAnchor : `${baseAnchor}-${anchorCount + 1}`,
      group,
      label: getDashboardGroupLabel(group),
      widgets: widgetsForGroup,
      widgetCount: 0,
      needsAttention: 0,
    };
    usedAnchors.set(baseAnchor, anchorCount + 1);

    return {
      ...tabWithoutCounts,
      // Built-ins are not counted: the muted badge reports registered
      // widget volume only (the mockup's System tab carries no badge).
      widgetCount: countTabWidgets(tabWithoutCounts),
      needsAttention: countNeedsAttention(tabWithoutCounts),
    };
  });
}

export function TabBar({ tabs }: { tabs: WidgetTab[] }): JSX.Element {
  return (
    <nav class="dashboard-tabs" aria-label="Dashboard sections" role="tablist">
      <a
        id="dashboard-tab-overview"
        class="dashboard-tab is-active"
        href="#overview"
        role="tab"
        aria-selected="true"
        data-dashboard-tab-link="overview"
        data-ui-tab="overview"
      >
        Overview
      </a>
      {tabs.map((tab) => (
        <a
          id={`dashboard-tab-${tab.id}`}
          class="dashboard-tab"
          href={`#${tab.id}`}
          role="tab"
          aria-selected="false"
          data-dashboard-tab-link={tab.id}
          data-ui-tab={tab.id}
          key={tab.id}
        >
          <span>{tab.label}</span>
          {tab.needsAttention > 0 ? (
            <span class="tab-badge tab-badge--needs">{tab.needsAttention}</span>
          ) : tab.widgetCount > 0 ? (
            <span class="tab-badge tab-badge--muted">{tab.widgetCount}</span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}
