/** @jsxImportSource preact */
import type { WidgetComponentProps } from "@brains/dashboard";
import type { JSX } from "preact";
import {
  AGENT_NETWORK_KINDS,
  agentNetworkWidgetDataSchema,
  type AgentNetworkAgentRow,
  type AgentNetworkKind,
  type AgentNetworkOverview,
  type AgentNetworkSkillRow,
  type AgentNetworkTagFilter,
} from "../lib/agent-network-widget";

export const agentNetworkWidgetScript = `(function () {
  function setActive(nodes, match) {
    nodes.forEach(function (node) {
      var active = match(node);
      node.classList.toggle("is-active", active);
      if (node.hasAttribute("aria-pressed")) {
        node.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
  }

  function parseTags(row) {
    var raw = row.getAttribute("data-agent-network-tags");
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  document.querySelectorAll("[data-agent-network-widget]").forEach(function (widget) {
    var viewTabs = widget.querySelectorAll("[data-agent-network-view-tab]");
    var kindTabs = widget.querySelectorAll("[data-agent-network-kind-tab]");
    var panels = widget.querySelectorAll("[data-agent-network-panel]");
    var tagFilters = widget.querySelectorAll("[data-agent-network-tag-filter]");
    var skillRows = widget.querySelectorAll("[data-agent-network-skill-row]");

    function showPanel(key) {
      setActive(panels, function (panel) {
        return panel.getAttribute("data-agent-network-panel") === key;
      });
    }

    function activeKind() {
      var active = widget.querySelector("[data-agent-network-kind-tab].is-active");
      return active ? active.getAttribute("data-agent-network-kind-tab") || "all" : "all";
    }

    function setView(view) {
      widget.setAttribute("data-agent-network-view", view);
      setActive(viewTabs, function (tab) {
        return tab.getAttribute("data-agent-network-view-tab") === view;
      });
      if (view === "overview") {
        showPanel("overview");
      } else if (view === "agents") {
        showPanel(activeKind());
      } else {
        showPanel("skills");
      }
    }

    function setKind(kind) {
      setActive(kindTabs, function (tab) {
        return tab.getAttribute("data-agent-network-kind-tab") === kind;
      });
      setView("agents");
      showPanel(kind);
    }

    function setTagFilter(filter) {
      setActive(tagFilters, function (button) {
        return button.getAttribute("data-agent-network-tag-filter") === filter;
      });
      skillRows.forEach(function (row) {
        var tags = parseTags(row);
        var visible = filter === "all" || tags.indexOf(filter) !== -1;
        row.toggleAttribute("data-hidden", !visible);
      });
    }

    viewTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var view = tab.getAttribute("data-agent-network-view-tab");
        if (view) setView(view);
      });
    });

    kindTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var kind = tab.getAttribute("data-agent-network-kind-tab");
        if (kind) setKind(kind);
      });
    });

    tagFilters.forEach(function (button) {
      button.addEventListener("click", function () {
        var filter = button.getAttribute("data-agent-network-tag-filter");
        if (filter) setTagFilter(filter);
      });
    });

    setView("overview");
    setTagFilter("all");
  });
})();`;

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

function OverviewPanel({
  overview,
}: {
  overview: AgentNetworkOverview;
}): JSX.Element {
  return (
    <div
      class="agent-network-panel is-active"
      data-agent-network-panel="overview"
    >
      <div class="agent-network-overview">
        <div class="agent-network-stat">
          <span class="count">{overview.approvedAgents}</span>
          <span class="label">approved agents</span>
        </div>
        <div class="agent-network-stat">
          <span class="count">{overview.discoveredAgents}</span>
          <span class="label">pending review</span>
        </div>
        <div class="agent-network-stat">
          <span class="count">{overview.brainSkills}</span>
          <span class="label">brain skills</span>
        </div>
        <div class="agent-network-stat">
          <span class="count">{overview.networkSkills}</span>
          <span class="label">network skills</span>
        </div>
      </div>
      {overview.topTags.length > 0 && (
        <div class="agent-network-overview-tags">
          {overview.topTags.map((tag) => (
            <span
              key={tag.tag}
              class={`agent-network-filter${tag.variant === "gap" ? " is-gap" : ""}`}
            >
              <span class="count">{tag.count}</span>
              <span class="label">{tag.tag}</span>
            </span>
          ))}
        </div>
      )}
    </div>
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
    <div data-agent-network-widget data-agent-network-view="overview">
      <div
        class="agent-network-view-tabs"
        role="tablist"
        aria-label="Browse the agent network"
      >
        <button
          class="agent-network-view-tab is-active"
          type="button"
          data-agent-network-view-tab="overview"
          aria-pressed="true"
        >
          Overview
        </button>
        <button
          class="agent-network-view-tab"
          type="button"
          data-agent-network-view-tab="agents"
          aria-pressed="false"
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

      <OverviewPanel overview={widgetData.overview} />
      {AGENT_NETWORK_KINDS.map((kind) => (
        <AgentPanel
          key={kind}
          kind={kind}
          items={widgetData.agents[kind]}
          active={false}
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
