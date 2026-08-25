import { describe, it, expect } from "bun:test";
import { parseMarkdown } from "@brains/sdk/entities";
import { skill } from "../src/skill-entity";
import { createSkillContent } from "../src/lib/directory-markdown";
import type { SkillEntity, SkillMetadata } from "../src/schemas/skill";

function markdown(): NonNullable<typeof skill.markdown> {
  const codec = skill.markdown;
  if (!codec) throw new Error("The skill type declares no markdown codec");
  return codec;
}

/** What the runtime derives from a stored file. */
function decode(content: string): { metadata: Partial<SkillMetadata> } {
  const { frontmatter } = parseMarkdown(content);
  return markdown().decode({ content, frontmatter });
}

/** What the runtime writes back for an entity. */
function encode(entity: SkillEntity): string {
  return markdown().encode({
    content: entity.content,
    metadata: skill.metadata.parse(entity.metadata),
  }).content;
}

describe("skill content", () => {
  it("should have correct entity type", () => {
    expect(skill.type).toBe("skill");
  });

  describe("decode", () => {
    it("should parse frontmatter into metadata with name", () => {
      const stored = `---
name: Institutional Design
description: Knowledge of institutional design patterns
tags:
  - institutions
  - governance
examples:
  - What are the key principles?
---`;

      const partial = decode(stored);
      expect(partial.metadata.name).toBe("Institutional Design");
    });
  });

  describe("encode", () => {
    it("rebuilds markdown from entity metadata", () => {
      // Stale frontmatter (only `name`) plus canonical metadata — the
      // output should reflect the metadata, not the stale disk content.
      const staleContent = "---\nname: Stale\n---\n";
      const entity: SkillEntity = {
        id: "skill-test",
        entityType: "skill",
        content: staleContent,
        created: "2026-04-02T00:00:00.000Z",
        updated: "2026-04-02T00:00:00.000Z",
        visibility: "public",
        metadata: {
          name: "Test",
          description: "Test skill",
          tags: ["test"],
          examples: ["example"],
        },
        contentHash: "abc",
      };

      const output = encode(entity);
      expect(output).toContain("name: Test");
      expect(output).toContain("description: Test skill");
      expect(output).not.toContain("name: Stale");
    });
  });

  describe("createSkillContent", () => {
    it("should build markdown with all frontmatter fields", () => {
      const content = createSkillContent({
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
      const content = createSkillContent({
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
