import { describe, it, expect, beforeEach } from "bun:test";
import { IdentityAdapter } from "../src/adapter";
import type { IdentityEntity } from "../src/schema";
import { z } from "@brains/utils";
import { createTestEntity } from "@brains/test-utils";

describe("IdentityAdapter", () => {
  let adapter: IdentityAdapter;

  beforeEach(() => {
    adapter = new IdentityAdapter();
  });

  describe("schema", () => {
    it("should have valid identity schema", () => {
      const schema = adapter.schema;

      const validIdentity = createTestEntity<IdentityEntity>("identity", {
        id: "identity",
        content: "",
      });

      expect(() => schema.parse(validIdentity)).not.toThrow();
    });

    it("should reject invalid identity entity type", () => {
      const schema = adapter.schema;

      const base = createTestEntity("identity", {
        id: "identity",
        content: "",
      });
      const invalidIdentity = {
        ...base,
        entityType: "other",
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
      };

      expect(() => schema.parse(invalidIdentity)).toThrow();
    });

    it("should reject invalid identity ID", () => {
      const schema = adapter.schema;

      const base = createTestEntity("identity", {
        id: "wrong:id",
        content: "",
      });
      const invalidIdentity = {
        ...base,
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
      };

      expect(() => schema.parse(invalidIdentity)).toThrow();
    });
  });

  describe("frontmatterSchema", () => {
    it("should expose frontmatterSchema for CMS", () => {
      expect(adapter.frontmatterSchema).toBeDefined();
      expect(adapter.frontmatterSchema.shape).toHaveProperty("name");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("role");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("purpose");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("values");
    });

    it("should be a singleton", () => {
      expect(adapter.isSingleton).toBe(true);
    });

    it("should not have a body", () => {
      expect(adapter.hasBody).toBe(false);
    });
  });

  describe("toMarkdown", () => {
    it("should convert identity entity to frontmatter format", () => {
      const content = adapter.createIdentityContent({
        name: "Personal Brain",
        role: "Personal knowledge assistant",
        purpose:
          "Help organize, understand, and retrieve information from your personal knowledge base.",
        values: ["clarity", "accuracy", "helpfulness"],
      });

      const entity = createTestEntity<IdentityEntity>("identity", {
        id: "identity",
        content,
      });

      const markdown = adapter.toMarkdown(entity);

      // Should be frontmatter format
      expect(markdown).toContain("---");
      expect(markdown).toContain("name: Personal Brain");
      expect(markdown).toContain("role: Personal knowledge assistant");
      expect(markdown).toContain("purpose:");
      expect(markdown).toContain("values:");
      expect(markdown).toContain("- clarity");
      expect(markdown).toContain("- accuracy");
      expect(markdown).toContain("- helpfulness");
    });
  });

  describe("parseIdentityBody", () => {
    it("should parse frontmatter format to identity body", () => {
      const markdown = `---
name: Research Brain
role: Research assistant
purpose: Help organize research papers and maintain literature review notes.
values:
  - academic rigor
  - citation accuracy
  - critical thinking
---
`;

      const result = adapter.parseIdentityBody(markdown);

      expect(result.name).toBe("Research Brain");
      expect(result.role).toBe("Research assistant");
      expect(result.purpose).toBe(
        "Help organize research papers and maintain literature review notes.",
      );
      expect(result.values).toEqual([
        "academic rigor",
        "citation accuracy",
        "critical thinking",
      ]);
    });

    it("should parse legacy structured markdown to identity body", () => {
      const markdown = `# Brain Identity

## Name
Research Brain

## Role
Research assistant

## Purpose
Help organize research papers and maintain literature review notes.

## Values

- academic rigor
- citation accuracy
- critical thinking`;

      const result = adapter.parseIdentityBody(markdown);

      expect(result.name).toBe("Research Brain");
      expect(result.role).toBe("Research assistant");
      expect(result.purpose).toBe(
        "Help organize research papers and maintain literature review notes.",
      );
      expect(result.values).toEqual([
        "academic rigor",
        "citation accuracy",
        "critical thinking",
      ]);
    });

    it("should throw error for markdown without proper structure", () => {
      const markdown = "Some random text without structure";

      expect(() => adapter.parseIdentityBody(markdown)).toThrow();
    });

    it("should throw error for empty markdown", () => {
      const markdown = "";

      expect(() => adapter.parseIdentityBody(markdown)).toThrow();
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter format", () => {
      const markdown = `---
name: Research Brain
role: Research assistant
purpose: Help organize research papers.
values:
  - academic rigor
  - citation accuracy
---
`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("identity");
      expect(result.content).toBeDefined();
      // Content should be stored as frontmatter format
      expect(result.content).toContain("---");
      expect(result.content).toContain("name: Research Brain");
    });

    it("should auto-convert legacy structured markdown to frontmatter", () => {
      const markdown = `# Brain Identity

## Name
Research Brain

## Role
Research assistant

## Purpose
Help organize research papers.

## Values

- academic rigor
- citation accuracy`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("identity");
      // Legacy content should be converted to frontmatter format
      expect(result.content).toContain("---");
      expect(result.content).toContain("name: Research Brain");
      expect(result.content).toContain("role: Research assistant");
    });
  });

  describe("extractMetadata", () => {
    it("should extract role and values as metadata", () => {
      const content = adapter.createIdentityContent({
        name: "Team Brain",
        role: "Team coordinator",
        purpose: "Facilitate knowledge sharing across the organization",
        values: ["collaboration", "transparency", "accessibility"],
      });

      const entity = createTestEntity<IdentityEntity>("identity", {
        id: "identity",
        content,
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        role: "Team coordinator",
        values: ["collaboration", "transparency", "accessibility"],
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string from entity", () => {
      const content = adapter.createIdentityContent({
        name: "Test Brain",
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
      });

      const entity = createTestEntity<IdentityEntity>("identity", {
        id: "identity",
        content,
      });

      const result = adapter.generateFrontMatter(entity);

      expect(result).toContain("name: Test Brain");
      expect(result).toContain("role: Assistant");
    });
  });

  describe("parseFrontMatter", () => {
    it("should parse frontmatter from markdown", () => {
      const markdown = `---
name: Assistant
role: Helper
purpose: Help out
values:
  - clarity
---
`;

      const result = adapter.parseFrontMatter(
        markdown,
        z.object({ name: z.string(), role: z.string() }),
      );

      expect(result).toEqual({ name: "Assistant", role: "Helper" });
    });
  });

  describe("roundtrip conversion", () => {
    it("should preserve data through createIdentityContent and parseIdentityBody", () => {
      const originalData = {
        name: "Personal Brain",
        role: "Personal knowledge assistant",
        purpose:
          "Help organize, understand, and retrieve information from your personal knowledge base.",
        values: ["clarity", "accuracy", "helpfulness"],
      };

      const content = adapter.createIdentityContent(originalData);
      const parsed = adapter.parseIdentityBody(content);

      expect(parsed.name).toBe(originalData.name);
      expect(parsed.role).toBe(originalData.role);
      expect(parsed.purpose).toBe(originalData.purpose);
      expect(parsed.values).toEqual(originalData.values);
    });

    it("should preserve data through toMarkdown and parseIdentityBody", () => {
      const originalData = {
        name: "Test Brain",
        role: "Test assistant",
        purpose: "Testing roundtrip",
        values: ["testing", "precision"],
      };

      const content = adapter.createIdentityContent(originalData);
      const entity = createTestEntity<IdentityEntity>("identity", {
        id: "identity",
        content,
      });

      const markdown = adapter.toMarkdown(entity);
      const parsed = adapter.parseIdentityBody(markdown);

      expect(parsed.name).toBe(originalData.name);
      expect(parsed.role).toBe(originalData.role);
      expect(parsed.purpose).toBe(originalData.purpose);
      expect(parsed.values).toEqual(originalData.values);
    });
  });
});
