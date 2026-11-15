import { describe, it, expect } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import {
  createSkillContent,
  skillFromMarkdown,
} from "../src/lib/agent-content";
import type { SkillEntity } from "../src/schemas/skill";
import { skillPlugins } from "./agent-discovery-plugins";

/** The skill type's adapter, as the installed package registers it. */
async function skillTypeAdapter(): Promise<
  ReturnType<
    ReturnType<
      ReturnType<typeof createMockShell>["getEntityRegistry"]
    >["getAdapter"]
  >
> {
  const shell = createMockShell();
  for (const plugin of skillPlugins()) await plugin.register(shell);
  return shell.getEntityRegistry().getAdapter("skill");
}

describe("the skill type's content", () => {
  it("should have correct entity type", async () => {
    expect((await skillTypeAdapter()).entityType).toBe("skill");
  });

  describe("skillFromMarkdown", () => {
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

      expect(skillFromMarkdown(markdown).name).toBe("Institutional Design");
    });
  });

  describe("toMarkdown", () => {
    it("rebuilds markdown from entity metadata", async () => {
      // A skill reads as its (empty) body, its fields as metadata: the
      // output is the metadata as its header.
      const staleContent = "";
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

      const output = (await skillTypeAdapter()).toMarkdown(entity);
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
