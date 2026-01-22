// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import { useState, useMemo } from "preact/hooks";
import type { VNode } from "preact";
import type { DashboardData, WidgetData } from "./schema";
import type { WidgetRendererName } from "../../widget-registry";
import {
  StatsWidget,
  ListWidget,
  CustomWidget,
  type BaseWidgetProps,
} from "@brains/ui-library";

/**
 * Renderer lookup map
 *
 * TODO: Future enhancement - support dynamic renderer resolution
 * Currently uses static lookup. See docs/plans/extensible-dashboard.md
 * for future options including dynamic imports and client-side registry.
 */
const RENDERER_MAP: Record<
  WidgetRendererName,
  (props: BaseWidgetProps) => VNode
> = {
  StatsWidget,
  ListWidget,
  CustomWidget,
};

/**
 * Props for the dashboard layout
 */
export type DashboardLayoutProps = DashboardData;

interface DashboardRenderProps {
  groups: {
    primary: WidgetData[];
    secondary: WidgetData[];
    sidebar: WidgetData[];
  };
  buildInfo: DashboardData["buildInfo"];
  filter: string;
  sortBy: "priority" | "title";
  showSidebar: boolean;
  onFilterChange?: (value: string) => void;
  onSortChange?: () => void;
  onToggleSidebar?: () => void;
}

/**
 * Group and filter widgets by section
 */
function groupWidgetsBySection(
  widgets: Record<string, WidgetData>,
  filter: string,
  sortBy: "priority" | "title",
): {
  primary: WidgetData[];
  secondary: WidgetData[];
  sidebar: WidgetData[];
} {
  const groups = {
    primary: [] as WidgetData[],
    secondary: [] as WidgetData[],
    sidebar: [] as WidgetData[],
  };

  const filterLower = filter.toLowerCase();

  for (const widgetData of Object.values(widgets)) {
    // Apply filter
    if (
      filter &&
      !widgetData.widget.title.toLowerCase().includes(filterLower)
    ) {
      continue;
    }

    const section = widgetData.widget.section;
    groups[section].push(widgetData);
  }

  // Sort each group
  const sortFn =
    sortBy === "priority"
      ? (a: WidgetData, b: WidgetData) => a.widget.priority - b.widget.priority
      : (a: WidgetData, b: WidgetData) =>
          a.widget.title.localeCompare(b.widget.title);

  for (const section of Object.keys(groups) as Array<keyof typeof groups>) {
    groups[section].sort(sortFn);
  }

  return groups;
}

/**
 * Render a single widget using its registered renderer
 */
function renderWidget(widgetData: WidgetData): VNode {
  const { widget, data } = widgetData;
  const key = `${widget.pluginId}:${widget.id}`;
  const Renderer = RENDERER_MAP[widget.rendererName];

  return (
    <div key={key}>
      <Renderer
        title={widget.title}
        description={widget.description}
        data={data}
      />
    </div>
  );
}

/**
 * Pure functional component for rendering dashboard - works in SSR
 */
const DashboardRender = ({
  groups,
  buildInfo,
  filter,
  sortBy,
  showSidebar,
  onFilterChange,
  onSortChange,
  onToggleSidebar,
}: DashboardRenderProps): VNode => {
  return (
    <div
      className="dashboard p-6 bg-theme"
      data-component="dashboard:dashboard"
    >
      <h2 className="text-2xl font-bold mb-4 text-theme">System Dashboard</h2>

      {/* Interactive controls */}
      <div
        className="mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4"
        data-hydrate-controls="true"
      >
        <input
          type="text"
          placeholder="Filter widgets..."
          value={filter}
          onInput={
            onFilterChange
              ? (e): void =>
                  onFilterChange((e.target as HTMLInputElement).value)
              : undefined
          }
          className="px-4 py-2 bg-theme border border-theme rounded text-theme placeholder-theme-muted sm:flex-1"
        />
        <button
          onClick={onSortChange}
          className="px-4 py-2 bg-brand text-theme-inverse rounded hover:bg-brand-dark"
        >
          Sort by {sortBy === "priority" ? "Title" : "Priority"}
        </button>
        <button
          onClick={onToggleSidebar}
          className="px-4 py-2 bg-theme-muted text-theme rounded border border-theme hover:bg-theme-subtle"
        >
          {showSidebar ? "Hide" : "Show"} Sidebar
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content area */}
        <div className="flex-1 space-y-6">
          {/* Primary section */}
          {groups.primary.length > 0 && (
            <section className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.primary.map((w) => renderWidget(w))}
              </div>
            </section>
          )}

          {/* Secondary section */}
          {groups.secondary.length > 0 && (
            <section className="space-y-4">
              {groups.secondary.map((w) => renderWidget(w))}
            </section>
          )}
        </div>

        {/* Sidebar */}
        {showSidebar && groups.sidebar.length > 0 && (
          <aside className="lg:w-80 space-y-4">
            {groups.sidebar.map((w) => renderWidget(w))}
          </aside>
        )}
      </div>

      {/* Build info */}
      <div className="mt-6 text-sm text-theme-muted">
        Built: {new Date(buildInfo.timestamp).toLocaleString()} • v
        {buildInfo.version}
      </div>
    </div>
  );
};

/**
 * Interactive wrapper component with hooks for hydration
 */
export const DashboardWidget = (data: DashboardLayoutProps): VNode => {
  const isBrowser = typeof window !== "undefined";

  if (!isBrowser) {
    // SSR: render without hooks
    const groups = groupWidgetsBySection(data.widgets, "", "priority");
    return (
      <DashboardRender
        groups={groups}
        buildInfo={data.buildInfo}
        filter=""
        sortBy="priority"
        showSidebar={true}
      />
    );
  }

  // Browser: use hooks for interactivity
  const [sortBy, setSortBy] = useState<"priority" | "title">("priority");
  const [showSidebar, setShowSidebar] = useState(true);
  const [filter, setFilter] = useState("");

  const groups = useMemo(
    () => groupWidgetsBySection(data.widgets, filter, sortBy),
    [data.widgets, filter, sortBy],
  );

  return (
    <DashboardRender
      groups={groups}
      buildInfo={data.buildInfo}
      filter={filter}
      sortBy={sortBy}
      showSidebar={showSidebar}
      onFilterChange={setFilter}
      onSortChange={() =>
        setSortBy(sortBy === "priority" ? "title" : "priority")
      }
      onToggleSidebar={() => setShowSidebar(!showSidebar)}
    />
  );
};

/**
 * Static layout export (for SSR without interactivity)
 */
export function DashboardLayout(props: DashboardLayoutProps): VNode {
  return DashboardWidget(props);
}
