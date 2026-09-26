import { describe, it, expect } from "bun:test";
import { buildTopicExtractionPrompt } from "../../src/lib/extraction-prompt";

describe("extraction-prompt", () => {
  it("defines topics as durable knowledge domains, not operational artifacts", () => {
    const prompt = buildTopicExtractionPrompt({
      entityTitle: "Launch Checklist",
      entityType: "post",
      content: "Need staging deploy and landing page copy updates.",
    });

    expect(prompt).toContain("durable knowledge domain");
    expect(prompt).toContain("never operational activities");
    expect(prompt).toContain("one-off tasks");
  });

  it("includes canonicalization guidance and existing titles in the prompt", () => {
    const prompt = buildTopicExtractionPrompt({
      entityTitle: "Human-Agent Collaboration",
      entityType: "post",
      content: "Agents and humans coordinate work together.",
      existingTopicTitles: ["Human-AI Collaboration", "Fragmentation"],
    });

    expect(prompt).toContain("CANONICALIZATION RULES");
    expect(prompt).toContain("Human-AI Collaboration");
    expect(prompt).toContain("Fragmentation");
    expect(prompt).toContain("Agents and humans coordinate work together.");
  });
});
