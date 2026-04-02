import { describe, it, expect } from "bun:test";
import { SkillAdapter } from "../src/adapters/skill-adapter";

const adapter = new SkillAdapter();

describe("SkillAdapter", () => {
  it("should have correct entity type", () => {
    expect(adapter.entityType).toBe("skill");
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter into metadata with name", () => {
      const markdown = `---
name: Institutional Design
description: Knowledge of institutional design patterns
tags:
  - institutions
  - governance
examples:
  - What are the key principles?
---`;

      const partial = adapter.fromMarkdown(markdown);
      expect(partial.entityType).toBe("skill");
      expect(partial.metadata?.name).toBe("Institutional Design");
    });
  });

  describe("toMarkdown", () => {
    it("should return entity content as-is", () => {
      const content = "---\nname: Test\n---\n";
      const entity = {
        id: "skill-test",
        entityType: "skill" as const,
        content,
        created: "2026-04-02T00:00:00.000Z",
        updated: "2026-04-02T00:00:00.000Z",
        metadata: { name: "Test" },
        contentHash: "abc",
      };

      expect(adapter.toMarkdown(entity)).toBe(content);
    });
  });

  describe("createSkillContent", () => {
    it("should build markdown with all frontmatter fields", () => {
      const content = adapter.createSkillContent({
        name: "Ecosystem Architecture",
        description: "Design patterns for living systems",
        tags: ["systems", "design"],
        examples: ["How do ecosystems self-organize?"],
      });

      expect(content).toContain("name: Ecosystem Architecture");
      expect(content).toContain(
        "description: Design patterns for living systems",
      );
      expect(content).toContain("- systems");
      expect(content).toContain("- design");
      expect(content).toContain("- How do ecosystems self-organize?");
    });

    it("should handle empty tags and examples", () => {
      const content = adapter.createSkillContent({
        name: "Simple Skill",
        description: "A basic skill",
        tags: [],
        examples: [],
      });

      expect(content).toContain("name: Simple Skill");
      expect(content).toContain("description: A basic skill");
      expect(content).toContain("tags: []");
      expect(content).toContain("examples: []");
    });
  });
});
