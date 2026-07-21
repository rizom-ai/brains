/** @jsxImportSource preact */
import {
  WidgetEmptyState,
  WidgetFilter,
  WidgetList,
  WidgetListItem,
  WidgetStatusPill,
  WidgetTabs,
  type WidgetComponentProps,
  type WidgetFilterOption,
} from "@brains/dashboard";
import type { ComponentChildren, JSX } from "preact";
import {
  AGENT_NETWORK_KINDS,
  agentNetworkWidgetDataSchema,
  type AgentNetworkAgentRow,
  type AgentNetworkKind,
  type AgentNetworkSkillRow,
  type AgentNetworkTagFilter,
} from "../lib/agent-network-widget";
import agentNetworkWidgetStyles from "./agent-network-widget.css" with { type: "text" };

export { agentNetworkWidgetScript } from "./agent-network-widget-script";
export { agentNetworkWidgetStyles };

function AgentListItem({ item }: { item: AgentNetworkAgentRow }): JSX.Element {
  let trailing: ComponentChildren;
  if (item.status === "discovered") {
    trailing = <WidgetStatusPill tone="warn">review</WidgetStatusPill>;
  } else if (item.status === "archived") {
    trailing = <WidgetStatusPill>archived</WidgetStatusPill>;
  } else {
    trailing = (
      <button
        class="agent-network-promote"
        type="button"
        data-external-peer-invite={item.id}
        data-external-peer-name={item.name.split(" · ", 1)[0] ?? item.name}
        hidden
      >
        Invite person
      </button>
    );
  }

  return (
    <WidgetListItem
      title={item.name}
      description={item.description}
      tags={item.tags}
      trailing={trailing}
    />
  );
}

function SkillListItem({ item }: { item: AgentNetworkSkillRow }): JSX.Element {
  return (
    <WidgetListItem
      title={item.name}
      className="agent-network-skill-row"
      filterValues={item.tags}
      itemProps={{
        "data-agent-network-skill-row": true,
        "data-agent-network-tags": JSON.stringify(item.tags),
      }}
      trailing={
        <span
          class={`agent-network-source${item.sourceType === "brain" ? " is-brain" : ""}`}
        >
          {item.sourceLabel}
        </span>
      }
    />
  );
}

function AgentPanel({ items }: { items: AgentNetworkAgentRow[] }): JSX.Element {
  if (items.length === 0) {
    return (
      <WidgetEmptyState className="agent-network-empty">
        Nothing to show yet.
      </WidgetEmptyState>
    );
  }

  return (
    <WidgetList className="agent-network-list">
      {items.map((item) => (
        <AgentListItem key={item.id} item={item} />
      ))}
    </WidgetList>
  );
}

function SkillsPanel({
  skills,
  count,
  filters,
}: {
  skills: AgentNetworkSkillRow[];
  count: number;
  filters: AgentNetworkTagFilter[];
}): JSX.Element {
  const options: WidgetFilterOption[] = [
    {
      value: "all",
      label: "all",
      count,
      triggerProps: { "data-agent-network-tag-filter": "all" },
    },
    ...filters.map((filter) => ({
      value: filter.tag,
      label: filter.tag,
      count: filter.count,
      tone: filter.variant === "gap" ? ("gap" as const) : ("plain" as const),
      triggerProps: { "data-agent-network-tag-filter": filter.tag },
    })),
  ];

  return (
    <WidgetFilter
      label="Filter skills by tag"
      defaultValue="all"
      options={options}
    >
      {skills.length > 0 ? (
        <WidgetList className="agent-network-list agent-network-skills-list">
          {skills.map((item) => (
            <SkillListItem key={item.id} item={item} />
          ))}
        </WidgetList>
      ) : (
        <WidgetEmptyState className="agent-network-empty">
          Nothing to show yet.
        </WidgetEmptyState>
      )}
    </WidgetFilter>
  );
}

export function AgentNetworkWidget({
  data,
  instanceId = "agent-network",
}: WidgetComponentProps): JSX.Element {
  const parsed = agentNetworkWidgetDataSchema.safeParse(data);
  if (!parsed.success) return <WidgetEmptyState />;

  const widgetData = parsed.data;
  const kindTabs = AGENT_NETWORK_KINDS.map((kind: AgentNetworkKind) => ({
    value: kind,
    label: kind,
    count: widgetData.agents[kind].length,
    content: <AgentPanel items={widgetData.agents[kind]} />,
    panelClassName: "agent-network-panel",
    triggerProps: { "data-agent-network-kind-tab": kind },
    panelProps: { "data-agent-network-panel": kind },
  }));

  return (
    <WidgetTabs
      id={`${instanceId}-views`}
      label="Browse the agent network"
      defaultValue="agents"
      stateAttribute="data-agent-network-view"
      rootProps={{
        "data-agent-network-widget": true,
        "data-agent-network-view": "agents",
      }}
      tabs={[
        {
          value: "agents",
          label: "Agents",
          count: widgetData.counts.agents,
          content: (
            <WidgetTabs
              id={`${instanceId}-kinds`}
              label="Filter agents by kind"
              defaultValue="all"
              variant="pill"
              tabs={kindTabs}
            />
          ),
          panelClassName: "agent-network-view-panel",
          triggerProps: { "data-agent-network-view-tab": "agents" },
        },
        {
          value: "skills",
          label: "Skills",
          count: widgetData.counts.skills,
          content: (
            <SkillsPanel
              skills={widgetData.skills}
              count={widgetData.counts.skills}
              filters={widgetData.skillFilters}
            />
          ),
          panelClassName: "agent-network-view-panel",
          triggerProps: { "data-agent-network-view-tab": "skills" },
          panelProps: { "data-agent-network-panel": "skills" },
        },
      ]}
    />
  );
}
