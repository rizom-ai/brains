/** @jsxImportSource preact */
import type { WidgetComponentProps } from "@brains/dashboard";
import type { JSX } from "preact";
import {
  AGENT_NETWORK_KINDS,
  agentNetworkWidgetDataSchema,
  type AgentNetworkAgentRow,
  type AgentNetworkKind,
  type AgentNetworkSkillRow,
  type AgentNetworkTagFilter,
} from "../lib/agent-network-widget";
export { agentNetworkWidgetScript } from "./agent-network-widget-script";

function AgentListItem({ item }: { item: AgentNetworkAgentRow }): JSX.Element {
  return (
    <li class="list-item">
      <div class="list-main">
        <span class="list-name">{item.name}</span>
        <span class="list-desc">{item.description}</span>
        {item.tags.length > 0 && (
          <div class="list-tags">
            {item.tags.map((tag) => (
              <span key={`${item.id}:${tag}`} class="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div class="list-meta">
        {item.status === "discovered" && (
          <span class="pill pill--warn">review</span>
        )}
      </div>
    </li>
  );
}

function SkillListItem({ item }: { item: AgentNetworkSkillRow }): JSX.Element {
  return (
    <li
      class="list-item agent-network-skill-row"
      data-agent-network-skill-row
      data-agent-network-tags={JSON.stringify(item.tags)}
    >
      <div class="list-main">
        <span class="list-name">{item.name}</span>
      </div>
      <div class="list-meta">
        <span
          class={`agent-network-source${item.sourceType === "brain" ? " is-brain" : ""}`}
        >
          {item.sourceLabel}
        </span>
      </div>
    </li>
  );
}

function AgentPanel({
  kind,
  items,
  active,
}: {
  kind: AgentNetworkKind;
  items: AgentNetworkAgentRow[];
  active: boolean;
}): JSX.Element {
  return (
    <div
      class={`agent-network-panel${active ? " is-active" : ""}`}
      data-agent-network-panel={kind}
    >
      {items.length > 0 ? (
        <ul class="list agent-network-list">
          {items.map((item) => (
            <AgentListItem key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p class="agent-network-empty">Nothing to show yet.</p>
      )}
    </div>
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
  return (
    <div class="agent-network-panel" data-agent-network-panel="skills">
      <div
        class="agent-network-filter-row"
        role="tablist"
        aria-label="Filter skills by tag"
      >
        <button
          class="agent-network-filter is-active"
          type="button"
          data-agent-network-tag-filter="all"
          aria-pressed="true"
        >
          <span class="count">{count}</span>
          <span class="label">all</span>
        </button>
        {filters.map((filter) => (
          <button
            key={filter.tag}
            class={`agent-network-filter${filter.variant === "gap" ? " is-gap" : ""}`}
            type="button"
            data-agent-network-tag-filter={filter.tag}
            aria-pressed="false"
          >
            <span class="count">{filter.count}</span>
            <span class="label">{filter.tag}</span>
          </button>
        ))}
      </div>

      {skills.length > 0 ? (
        <ul class="list agent-network-list agent-network-skills-list">
          {skills.map((item) => (
            <SkillListItem key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p class="agent-network-empty">Nothing to show yet.</p>
      )}
    </div>
  );
}

export function AgentNetworkWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = agentNetworkWidgetDataSchema.safeParse(data);

  if (!parsed.success) {
    return <p class="muted">Nothing to show yet.</p>;
  }

  const widgetData = parsed.data;

  return (
    <div data-agent-network-widget data-agent-network-view="agents">
      <div
        class="agent-network-view-tabs"
        role="tablist"
        aria-label="Browse the agent network"
      >
        <button
          class="agent-network-view-tab is-active"
          type="button"
          data-agent-network-view-tab="agents"
          aria-pressed="true"
        >
          Agents
          <span class="agent-network-view-count">
            {widgetData.counts.agents}
          </span>
        </button>
        <button
          class="agent-network-view-tab"
          type="button"
          data-agent-network-view-tab="skills"
          aria-pressed="false"
        >
          Skills
          <span class="agent-network-view-count">
            {widgetData.counts.skills}
          </span>
        </button>
      </div>

      <div
        class="agent-network-kind-tabs"
        role="tablist"
        aria-label="Filter agents by kind"
      >
        {AGENT_NETWORK_KINDS.map((kind) => {
          const isActive = kind === "all";
          return (
            <button
              key={kind}
              class={`agent-network-kind-tab${isActive ? " is-active" : ""}`}
              type="button"
              data-agent-network-kind-tab={kind}
              aria-pressed={isActive ? "true" : "false"}
            >
              <span class="agent-network-kind-count">
                {widgetData.agents[kind].length}
              </span>
              <span class="agent-network-kind-label">{kind}</span>
            </button>
          );
        })}
      </div>

      {AGENT_NETWORK_KINDS.map((kind) => (
        <AgentPanel
          key={kind}
          kind={kind}
          items={widgetData.agents[kind]}
          active={kind === "all"}
        />
      ))}
      <SkillsPanel
        skills={widgetData.skills}
        count={widgetData.counts.skills}
        filters={widgetData.skillFilters}
      />
    </div>
  );
}
