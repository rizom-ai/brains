import { describe, it, expect } from "bun:test";
import {
  buildSkillPrompt,
  type SkillDeriverInput,
} from "../src/lib/skill-deriver";

describe("buildSkillPrompt", () => {
  it("should include topic titles grouped", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing", "Distributed Systems", "Urban Sensing"],
      toolDescriptions: ["Create blog posts", "Build website"],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Event Sourcing");
    expect(prompt).toContain("Distributed Systems");
    expect(prompt).toContain("Urban Sensing");
  });

  it("should include tool descriptions", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["TypeScript"],
      toolDescriptions: [
        "Create and publish blog posts",
        "Generate social media content",
        "Build and deploy a website",
      ],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Create and publish blog posts");
    expect(prompt).toContain("Generate social media content");
    expect(prompt).toContain("Build and deploy a website");
  });

  it("should handle empty topics", () => {
    const input: SkillDeriverInput = {
      topicTitles: [],
      toolDescriptions: ["Create blog posts"],
    };

    const prompt = buildSkillPrompt(input);

    // Should still produce a prompt (tools-only skills)
    expect(prompt).toContain("Create blog posts");
  });

  it("should handle empty tools", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing"],
      toolDescriptions: [],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Event Sourcing");
  });

  it("should include the tag vocabulary primer when provided", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing"],
      toolDescriptions: ["Create blog posts"],
      tagVocabulary: [{ tag: "research", count: 3 }],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Current agent-directory tag vocabulary");
    expect(prompt).toContain("research (3)");
  });

  it("should ask for action-oriented skill descriptions", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing"],
      toolDescriptions: ["Create blog posts"],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("action-oriented");
    expect(prompt).toContain("Reuse an existing tag when one fits");
  });
});
