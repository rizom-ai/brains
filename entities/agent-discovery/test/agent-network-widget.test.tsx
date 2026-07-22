/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import {
  AgentNetworkWidget,
  agentNetworkWidgetStyles,
} from "../src/widgets/agent-network-widget";

describe("AgentNetworkWidget", () => {
  it("owns its dashboard styles", () => {
    expect(agentNetworkWidgetStyles).toContain(".agent-network-list");
    expect(agentNetworkWidgetStyles).toContain("prefers-reduced-motion");
  });

  it("renders agents and skills tabs in one widget", () => {
    const html = render(
      <AgentNetworkWidget
        title="Agent Network"
        data={{
          counts: { agents: 2, skills: 3 },
          agents: {
            all: [
              {
                id: "kai.brain",
                name: "Kai · kai.brain",
                description: "Research partner.",
                tags: ["research"],
                kind: "person",
                status: "approved",
                discoveredAt: "2026-04-20T00:00:00.000Z",
              },
              {
                id: "north.ops",
                name: "North · north.ops",
                description: "Operations team.",
                tags: ["operations"],
                kind: "team",
                status: "discovered",
                discoveredAt: "2026-04-21T00:00:00.000Z",
              },
            ],
            person: [
              {
                id: "kai.brain",
                name: "Kai · kai.brain",
                description: "Research partner.",
                tags: ["research"],
                kind: "person",
                status: "approved",
                discoveredAt: "2026-04-20T00:00:00.000Z",
              },
            ],
            team: [
              {
                id: "north.ops",
                name: "North · north.ops",
                description: "Operations team.",
                tags: ["operations"],
                kind: "team",
                status: "discovered",
                discoveredAt: "2026-04-21T00:00:00.000Z",
              },
            ],
            organization: [],
          },
          skillFilters: [
            { tag: "research", count: 2 },
            { tag: "data analysis", count: 1, variant: "gap" },
          ],
          skills: [
            {
              id: "brain:research",
              name: "Research & Writing",
              tags: ["research"],
              sourceLabel: "brain",
              sourceType: "brain",
            },
            {
              id: "kai:citations",
              name: "Citation Work",
              tags: ["research", "citations"],
              sourceLabel: "kai.brain",
              sourceType: "agent",
            },
            {
              id: "north:ops",
              name: "Runbook Maintenance",
              tags: ["operations"],
              sourceLabel: "north.ops",
              sourceType: "agent",
            },
          ],
        }}
      />,
    );

    expect(html).toContain('data-agent-network-view="agents"');
    expect(html).toContain('data-agent-network-view-tab="agents"');
    expect(html).toContain('data-agent-network-view-tab="skills"');
    expect(html).toContain('data-ui-tabs-default="agents"');
    expect(html).toContain(
      'data-ui-tabs-state-attribute="data-agent-network-view"',
    );
    expect(html).toContain('data-ui-tabs-default="all"');
    expect(html).toContain('data-ui-tab="skills"');
    expect(html).toContain('data-ui-panel="person"');
    expect(html).toContain('data-agent-network-tag-filter="research"');
    expect(html).toContain(">review<");
  });
});
