// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import type { DashboardData, WidgetData } from "./schema";
import type { WidgetRendererName } from "../../widget-registry";
import {
  StatsWidget,
  ListWidget,
  CustomWidget,
  PipelineWidget,
  IdentityWidget,
  ProfileWidget,
  SystemWidget,
  type BaseWidgetProps,
} from "@brains/ui-library";

/**
 * Renderer lookup map
 */
const RENDERER_MAP: Record<
  WidgetRendererName,
  (props: BaseWidgetProps) => VNode
> = {
  StatsWidget,
  ListWidget,
  CustomWidget,
  PipelineWidget,
  IdentityWidget,
  ProfileWidget,
  SystemWidget,
};

/**
 * Props for the dashboard layout
 */
export type DashboardLayoutProps = DashboardData;

/**
 * Group widgets by section, sorted by priority
 */
function groupWidgetsBySection(widgets: Record<string, WidgetData>): {
  primary: WidgetData[];
  secondary: WidgetData[];
  sidebar: WidgetData[];
} {
  const groups = {
    primary: [] as WidgetData[],
    secondary: [] as WidgetData[],
    sidebar: [] as WidgetData[],
  };

  for (const widgetData of Object.values(widgets)) {
    const section = widgetData.widget.section;
    groups[section].push(widgetData);
  }

  const sortByPriority = (a: WidgetData, b: WidgetData): number =>
    a.widget.priority - b.widget.priority;

  for (const section of Object.keys(groups) as Array<keyof typeof groups>) {
    groups[section].sort(sortByPriority);
  }

  return groups;
}

/**
 * Render a single widget using its registered renderer
 */
function renderWidget(widgetData: WidgetData, spanCols?: boolean): VNode {
  const { widget, data } = widgetData;
  const key = `${widget.pluginId}:${widget.id}`;
  const Renderer = RENDERER_MAP[widget.rendererName];
  const spanClass = spanCols ? "col-span-1 lg:col-span-2" : "";

  return (
    <div key={key} className={spanClass}>
      <Renderer
        title={widget.title}
        description={widget.description}
        data={data}
      />
    </div>
  );
}

/**
 * Dashboard layout component
 *
 * Flat 3-column grid matching the prototype design:
 * - Primary widgets span 2 columns (top row)
 * - Sidebar spans all rows (right column)
 * - Secondary widgets span 2 columns (below primary)
 */
export function DashboardLayout({ widgets }: DashboardLayoutProps): VNode {
  const groups = groupWidgetsBySection(widgets);

  return (
    <div
      className="dashboard w-full max-w-layout mx-auto px-6 py-8 bg-theme"
      data-component="dashboard:dashboard"
    >
      {/* Grid: 3 columns on desktop, flat layout with col-spanning */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px] gap-4">
        {/* Primary widgets — span 2 cols */}
        {groups.primary.map((w) => renderWidget(w, true))}

        {/* Sidebar — spans all rows */}
        {groups.sidebar.length > 0 && (
          <aside className="row-span-3 lg:col-start-3 space-y-4">
            {groups.sidebar.map((w) => renderWidget(w))}
          </aside>
        )}

        {/* Secondary widgets — span 2 cols */}
        {groups.secondary.map((w) => renderWidget(w, true))}
      </div>
    </div>
  );
}

/**
 * Interactive wrapper — currently no client-side interactivity needed
 */
export const DashboardWidget = (data: DashboardLayoutProps): VNode => {
  return DashboardLayout(data);
};
