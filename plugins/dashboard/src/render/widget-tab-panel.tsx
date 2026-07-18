/** @jsxImportSource preact */
import type { JSX } from "preact";
import { EndpointsCard } from "./endpoints-card";
import { EntitySummaryCard } from "./entity-summary-card";
import { InteractionsCard } from "./interactions-card";
import { RuntimeCard } from "./runtime-card";
import {
  ContentSyncCard,
  JobQueueCard,
  SemanticIndexCard,
} from "./system-cards";
import type { WidgetTab } from "./dashboard-tabs";
import type { DashboardRenderInput } from "./types";
import { WidgetCard } from "./widget-card";

export function WidgetTabPanel({
  tab,
  input,
  now,
}: {
  tab: WidgetTab;
  input: DashboardRenderInput;
  now: Date;
}): JSX.Element {
  const mainWidgets = [...tab.widgets.primary, ...tab.widgets.secondary];
  const hasSystemBuiltIns = tab.group === "system";
  const hasKnowledgeBuiltIns = tab.group === "knowledge";
  const hasSidebar = tab.widgets.sidebar.length > 0 || hasSystemBuiltIns;

  return (
    <section
      id={tab.id}
      class="dashboard-tab-panel"
      data-dashboard-tab-panel
      data-dashboard-group={tab.group}
      data-ui-panel={tab.id}
      role="tabpanel"
      aria-labelledby={`dashboard-tab-${tab.id}`}
    >
      <header class="tab-section-head">
        <h2>{tab.label}</h2>
      </header>
      <div
        class={`layout tab-layout${hasSidebar ? "" : " tab-layout--main-only"}`}
      >
        <div class="main-column">
          {hasKnowledgeBuiltIns && (
            <EntitySummaryCard
              total={input.appInfo.entities}
              entityCounts={input.appInfo.entityCounts}
            />
          )}
          {hasSystemBuiltIns && (
            <>
              <SemanticIndexCard input={input} />
              {input.directorySyncStatus && (
                <ContentSyncCard status={input.directorySyncStatus} />
              )}
              <JobQueueCard jobs={input.jobProgress ?? []} />
            </>
          )}
          {mainWidgets.map((widget) => (
            <WidgetCard
              key={`${widget.widget.pluginId}:${widget.widget.id}`}
              widget={widget}
            />
          ))}
        </div>
        {hasSidebar && (
          <div class="sidebar-column">
            {hasSystemBuiltIns && (
              <>
                <EndpointsCard
                  endpoints={input.appInfo.endpoints}
                  baseUrl={input.baseUrl}
                />
                <RuntimeCard appInfo={input.appInfo} now={now} />
                <InteractionsCard
                  interactions={input.appInfo.interactions}
                  baseUrl={input.baseUrl}
                />
              </>
            )}
            {tab.widgets.sidebar.map((widget) => (
              <WidgetCard
                key={`${widget.widget.pluginId}:${widget.widget.id}`}
                widget={widget}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
