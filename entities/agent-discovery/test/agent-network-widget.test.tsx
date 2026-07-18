/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import {
  AgentNetworkWidget,
  agentNetworkWidgetScript,
  agentNetworkWidgetStyles,
} from "../src/widgets/agent-network-widget";

describe("AgentNetworkWidget", () => {
  it("owns its dashboard styles", () => {
    expect(agentNetworkWidgetStyles).toContain(".agent-network-list");
    expect(agentNetworkWidgetStyles).toContain("prefers-reduced-motion");
  });

  it("bridges approved-agent promotion into the Anchor People flow", () => {
    expect(agentNetworkWidgetScript).toContain(
      'sessionStorage.setItem("brains:people-agent-promotion"',
    );
    expect(agentNetworkWidgetScript).toContain(
      'window.location.assign("/admin")',
    );
    expect(agentNetworkWidgetScript).not.toContain("brains:agent-promote");
    expect(agentNetworkWidgetScript).toContain('data-auth-role") === "anchor"');
    expect(agentNetworkWidgetScript).toContain("data-agent-person-claims");
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
                kind: "professional",
                status: "approved",
                discoveredAt: "2026-04-20T00:00:00.000Z",
                representedPersonClaims: [
                  {
                    type: "did",
                    subject: "did:plc:kai",
                    label: "Kai DID",
                  },
                ],
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
            professional: [
              {
                id: "kai.brain",
                name: "Kai · kai.brain",
                description: "Research partner.",
                tags: ["research"],
                kind: "professional",
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
            collective: [],
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
    expect(html).toContain('data-ui-panel="professional"');
    expect(html).toContain('data-agent-network-tag-filter="research"');
    expect(html).toContain(">review<");
    expect(html).toContain('data-agent-promote="kai.brain"');
    expect(html).toContain('data-agent-promote-name="Kai"');
    expect(html).toContain("data-agent-person-claims");
    expect(html).toContain("did:plc:kai");
    expect(html.match(/data-agent-promote=/g)).toHaveLength(2);
    expect(html).not.toContain('data-agent-promote="north.ops"');
  });
});
