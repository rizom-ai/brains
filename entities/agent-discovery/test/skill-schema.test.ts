import { describe, it, expect } from "bun:test";
import { agentSkillSchema } from "../src/schemas/agent";
import {
  skillFrontmatterSchema,
  skillMetadataSchema,
  skillEntitySchema,
} from "../src/schemas/skill";

describe("Skill schemas", () => {
  describe("skillFrontmatterSchema", () => {
    it("should validate complete frontmatter", () => {
      const result = skillFrontmatterSchema.safeParse({
        name: "Institutional Design",
        description: "Deep knowledge of institutional design patterns",
        tags: ["institutions", "governance"],
        examples: ["What are the key principles of institutional design?"],
      });
      expect(result.success).toBe(true);
    });

    it("should require name", () => {
      const result = skillFrontmatterSchema.safeParse({
        description: "Some description",
        tags: [],
        examples: [],
      });
      expect(result.success).toBe(false);
    });

    it("should require description", () => {
      const result = skillFrontmatterSchema.safeParse({
        name: "Test",
        tags: [],
        examples: [],
      });
      expect(result.success).toBe(false);
    });

    it("should accept empty tags and examples", () => {
      const result = skillFrontmatterSchema.safeParse({
        name: "Test Skill",
        description: "A test skill",
        tags: [],
        examples: [],
      });
      expect(result.success).toBe(true);
    });

    it("bounds tag count and tag length at ingestion", () => {
      const base = {
        name: "Bounded skill",
        description: "A bounded skill",
        examples: [],
      };

      expect(
        skillFrontmatterSchema.safeParse({
          ...base,
          tags: Array.from({ length: 30 }, (_, index) =>
            index === 0 ? "t".repeat(120) : `tag-${index}`,
          ),
        }).success,
      ).toBe(true);
      expect(
        skillFrontmatterSchema.safeParse({
          ...base,
          tags: Array.from({ length: 31 }, (_, index) => `tag-${index}`),
        }).success,
      ).toBe(false);
      expect(
        skillFrontmatterSchema.safeParse({
          ...base,
          tags: ["t".repeat(121)],
        }).success,
      ).toBe(false);
      expect(
        skillFrontmatterSchema.safeParse({ ...base, tags: ["   "] }).success,
      ).toBe(false);
    });
  });

  describe("agentSkillSchema", () => {
    it("uses the same ingestion bounds for remote agent skills", () => {
      const base = { name: "Remote skill", description: "A remote skill" };

      expect(
        agentSkillSchema.safeParse({
          ...base,
          tags: Array.from({ length: 31 }, (_, index) => `tag-${index}`),
        }).success,
      ).toBe(false);
      expect(
        agentSkillSchema.safeParse({
          ...base,
          tags: ["t".repeat(121)],
        }).success,
      ).toBe(false);
    });
  });

  describe("skillMetadataSchema", () => {
    it("should require all SkillData fields", () => {
      const result = skillMetadataSchema.safeParse({
        name: "Ecosystem Architecture",
        description: "Design sustainable ecosystems",
        tags: ["design"],
        examples: ["How do I design an ecosystem?"],
      });
      expect(result.success).toBe(true);
    });

    it("should reject missing fields", () => {
      const result = skillMetadataSchema.safeParse({ name: "Test" });
      expect(result.success).toBe(false);
    });
  });

  describe("skillEntitySchema", () => {
    it("should validate a complete skill entity", () => {
      const result = skillEntitySchema.safeParse({
        id: "skill-institutional-design",
        entityType: "skill",
        content: "---\nname: Institutional Design\n---",
        created: "2026-04-02T00:00:00.000Z",
        updated: "2026-04-02T00:00:00.000Z",
        metadata: {
          name: "Institutional Design",
          description: "Deep knowledge of institutional design patterns",
          tags: ["institutions"],
          examples: ["What are key principles?"],
        },
        contentHash: "abc123",
      });
      expect(result.success).toBe(true);
    });

    it("should reject wrong entityType", () => {
      const result = skillEntitySchema.safeParse({
        id: "skill-test",
        entityType: "post",
        content: "",
        created: "2026-04-02T00:00:00.000Z",
        updated: "2026-04-02T00:00:00.000Z",
        metadata: {
          name: "Test",
          description: "Test",
          tags: [],
          examples: [],
        },
        contentHash: "abc123",
      });
      expect(result.success).toBe(false);
    });
  });
});
