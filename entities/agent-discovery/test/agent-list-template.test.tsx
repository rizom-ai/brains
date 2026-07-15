/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import { AgentListTemplate } from "../src/templates/agent-list";
import { createTemplateAgent } from "./fixtures/agent";

const connected = createTemplateAgent({
  name: "Metis",
  url: "https://jo.rizom.ai",
  status: "approved",
});
const connectedWithOrg = createTemplateAgent({
  name: "Yeehaa",
  url: "https://yeehaa.io",
  status: "approved",
  organization: "Offcourse",
  skills: [
    { name: "Essay drafting", description: "Draft essays", tags: ["writing"] },
    { name: "Topic research", description: "Research topics", tags: [] },
    { name: "Link curation", description: "Curate links", tags: [] },
    { name: "Presentations", description: "Build decks", tags: [] },
    { name: "Newsletters", description: "Write newsletters", tags: [] },
  ],
});
const sighting = createTemplateAgent({
  name: "Phoney",
  url: "https://mylittlephoney.com",
  status: "discovered",
  introducedBy: ["yeehaa.io"],
  hops: 2,
});
const savedForReview = createTemplateAgent({
  name: "Manual",
  url: "https://manual.example.com",
  status: "discovered",
});
const archived = createTemplateAgent({
  name: "Docs",
  url: "https://docs.rizom.ai",
  status: "archived",
});

const allAgents = [
  connected,
  connectedWithOrg,
  sighting,
  savedForReview,
  archived,
];

describe("AgentListTemplate", () => {
  test("renders a single filter row with counts inside the pills", () => {
    const html = render(
      <AgentListTemplate agents={allAgents} selectedStatus="all" />,
    );

    expect(html).toContain('data-count="5"');
    expect(html).toContain('data-count="2"');
    expect(html).toContain('data-count="1"');
    // The old standalone count-pill row ("5 total") is gone.
    expect(html).not.toContain(" total");
    expect(html).toContain("?status=approved");
    expect(html).toContain("?status=discovered");
    expect(html).toContain("?status=archived");
  });

  test("groups agents under Connected, Sightings, and Archived sections", () => {
    const html = render(
      <AgentListTemplate agents={allAgents} selectedStatus="all" />,
    );

    expect(html).toContain("Connected");
    expect(html).toContain("Sightings");
    expect(html).toContain("Archived");
    expect(html).toContain("seen in peers");
    expect(html).toContain("kept as history");
  });

  test("sighting cards surface who introduced them", () => {
    const html = render(
      <AgentListTemplate agents={allAgents} selectedStatus="all" />,
    );

    expect(html).toContain("via yeehaa.io");
  });

  test("discovered agents without provenance await approval instead of claiming a sighting", () => {
    const html = render(
      <AgentListTemplate agents={[savedForReview]} selectedStatus="all" />,
    );

    expect(html).toContain("awaiting approval");
    expect(html).not.toContain("via ");
  });

  test("discovered agents are not dimmed to look disabled", () => {
    const html = render(
      <AgentListTemplate agents={allAgents} selectedStatus="all" />,
    );

    expect(html).not.toContain("opacity-70");
  });

  test("cards show the agent's domain", () => {
    const html = render(
      <AgentListTemplate agents={allAgents} selectedStatus="all" />,
    );

    expect(html).toContain("jo.rizom.ai");
    expect(html).toContain("mylittlephoney.com");
  });

  test("skill pills are capped with an overflow indicator", () => {
    const html = render(
      <AgentListTemplate agents={[connectedWithOrg]} selectedStatus="all" />,
    );

    expect(html).toContain("Essay drafting");
    expect(html).toContain("+2");
    expect(html).not.toContain("Presentations");
  });

  test("filtered view renders only the matching section", () => {
    const html = render(
      <AgentListTemplate
        agents={[sighting, savedForReview]}
        selectedStatus="discovered"
      />,
    );

    expect(html).toContain("Sightings");
    // Section hints from other statuses are absent; only the matching
    // section renders (the stat tabs still name every status).
    expect(html).not.toContain("kept as history");
  });

  test("renders empty state when there are no agents", () => {
    const html = render(<AgentListTemplate agents={[]} selectedStatus="all" />);

    expect(html).toContain("No agents in your directory yet.");
  });
});
