import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { enrichedAgentSchema } from "@brains/agent-discovery";
import { NetworkSection, type NetworkContent } from "../src/network";

type AgentItem = NetworkContent["agents"][number];

/** Agent fixtures go through the real schema — validated, never cast. */
function agent(overrides: {
  slug: string;
  name: string;
  url: string;
  organization?: string;
  about?: string;
}): AgentItem {
  return enrichedAgentSchema.parse({
    id: overrides.slug,
    entityType: "agent",
    content: "",
    contentHash: "fixture-hash",
    created: "2026-04-01T00:00:00Z",
    updated: "2026-04-01T00:00:00Z",
    metadata: {
      name: overrides.name,
      slug: overrides.slug,
      url: "https://brain.example.com",
      status: "approved",
    },
    frontmatter: {
      name: overrides.name,
      kind: "collective",
      ...(overrides.organization && { organization: overrides.organization }),
      brainName: "example-brain",
      url: "https://brain.example.com",
      status: "approved",
      discoveredAt: "2026-04-01T00:00:00Z",
    },
    about: overrides.about ?? "",
    skills: [],
    notes: "",
    url: overrides.url,
  });
}

describe("NetworkSection", () => {
  it("lists approved agents as directory rows linking to their cards", () => {
    const html = render(
      <NetworkSection
        agents={[
          agent({
            slug: "rizom",
            name: "Rizom",
            url: "/agents/rizom",
            organization: "Rizom Collective",
            about: "The collective's own brain.",
          }),
          agent({
            slug: "phoney",
            name: "Phoney",
            url: "/agents/phoney",
          }),
        ]}
      />,
    );

    expect(html).toContain("Network");
    expect(html).toContain("Rizom");
    expect(html).toContain('href="/agents/rizom"');
    expect(html).toContain("The collective's own brain.");
    expect(html).toContain("Rizom Collective");
    expect(html).toContain("Phoney");
  });

  it("renders an honest empty state before any agents are approved", () => {
    const html = render(<NetworkSection agents={[]} />);
    expect(html).toContain("No agents in the network yet");
  });
});
