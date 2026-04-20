/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { AgentNetworkWidget } from "../src/widgets/agent-network-widget";

describe("AgentNetworkWidget", () => {
  it("renders overview, agents, and skills tabs in one widget", () => {
    const html = render(
      <AgentNetworkWidget
        title="Agent Network"
        data={{
          counts: { agents: 2, skills: 3 },
          overview: {
            status: "ready",
            strengths: [{ title: "Research & writing", detail: "4 sources" }],
            weaknesses: [{ title: "Data analysis", detail: "uncovered" }],
            opportunities: [
              { title: "Video production", detail: "agent-only" },
            ],
            threats: [{ title: "3 agents", detail: "pending review" }],
            derivedAt: "2026-04-20T12:00:00.000Z",
          },
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

    expect(html).toContain('data-agent-network-view-tab="overview"');
    expect(html).toContain('data-agent-network-view-tab="agents"');
    expect(html).toContain('data-agent-network-view-tab="skills"');
    expect(html).toContain("data-swot-widget");
    expect(html).toContain("Research &amp; writing");
    expect(html).toContain('data-agent-network-tag-filter="research"');
    expect(html).toContain(">review<");
  });
});
