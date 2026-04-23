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
    it("rebuilds markdown from entity metadata", () => {
      // Stale frontmatter (only `name`) plus canonical metadata — the
      // output should reflect the metadata, not the stale disk content.
      const staleContent = "---\nname: Stale\n---\n";
      const entity = {
        id: "skill-test",
        entityType: "skill" as const,
        content: staleContent,
        created: "2026-04-02T00:00:00.000Z",
        updated: "2026-04-02T00:00:00.000Z",
        metadata: {
          name: "Test",
          description: "Test skill",
          tags: ["test"],
          examples: ["example"],
        },
        contentHash: "abc",
      };

      const output = adapter.toMarkdown(entity);
      expect(output).toContain("name: Test");
      expect(output).toContain("description: Test skill");
      expect(output).not.toContain("name: Stale");
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
