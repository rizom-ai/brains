/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import { AgentDetailTemplate } from "../src/templates/agent-detail";
import { createTemplateAgent } from "./fixtures/agent";

const connected = createTemplateAgent({
  name: "Metis",
  url: "https://jo.rizom.ai",
  status: "approved",
  did: "did:plc:h7k2abcdef9fq4",
});
const sighting = createTemplateAgent({
  name: "Phoney",
  url: "https://mylittlephoney.com",
  status: "discovered",
  introducedBy: ["yeehaa.io"],
  hops: 2,
  discoveredAt: "2026-07-14T12:00:00.000Z",
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

describe("AgentDetailTemplate", () => {
  test("connected agent reads as connected with no provenance", () => {
    const html = render(<AgentDetailTemplate agent={connected} />);

    expect(html).toContain("Connected");
    expect(html).toContain("https://jo.rizom.ai");
    expect(html).not.toContain("sighted through");
  });

  test("sighted agent shows provenance: introducer, hop distance, and first-seen date", () => {
    const html = render(<AgentDetailTemplate agent={sighting} />);

    expect(html).toContain("sighted through");
    expect(html).toContain("yeehaa.io");
    expect(html).toContain("2 hops");
    expect(html).toContain("Jul 14, 2026");
    expect(html).toContain("Not yet callable");
  });

  test("approve hint speaks to the human, not the tool layer", () => {
    const html = render(<AgentDetailTemplate agent={sighting} />);

    expect(html).toContain("Ask your brain");
    expect(html).toContain("connect to mylittlephoney.com");
    expect(html).not.toContain("agent_connect");
  });

  test("sighted agent lists its introducers with links", () => {
    const html = render(<AgentDetailTemplate agent={sighting} />);

    expect(html).toContain("Introduced by");
    expect(html).toContain('href="https://yeehaa.io"');
  });

  test("discovered agent without provenance awaits approval, not a sighting", () => {
    const html = render(<AgentDetailTemplate agent={savedForReview} />);

    expect(html).toContain("awaiting approval");
    expect(html).toContain("Not yet callable");
    expect(html).not.toContain("sighted through");
    expect(html).not.toContain("Introduced by");
  });

  test("archived agent is labeled archived", () => {
    const html = render(<AgentDetailTemplate agent={archived} />);

    expect(html).toContain("Archived");
  });

  test("skills render with their tags", () => {
    const html = render(<AgentDetailTemplate agent={connected} />);

    expect(html).toContain("Content Creation");
    expect(html).toContain("blog");
  });

  test("prev/next navigation renders neighbor names", () => {
    const html = render(
      <AgentDetailTemplate
        agent={sighting}
        prevAgent={connected}
        nextAgent={archived}
      />,
    );

    expect(html).toContain("Metis");
    expect(html).toContain("Docs");
  });
});
