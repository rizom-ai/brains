import { describe, it, expect, beforeEach } from "bun:test";
import { BrainCharacterAdapter } from "../src/brain-character-adapter";
import type { BrainCharacterEntity } from "../src/brain-character-schema";
import { z } from "@brains/utils";
import { createTestEntity } from "@brains/test-utils";

describe("BrainCharacterAdapter", () => {
  let adapter: BrainCharacterAdapter;

  beforeEach(() => {
    adapter = new BrainCharacterAdapter();
  });

  describe("schema", () => {
    it("should have valid character schema", () => {
      const schema = adapter.schema;

      const validCharacter = createTestEntity<BrainCharacterEntity>(
        "brain-character",
        {
          id: "brain-character",
          content: "",
        },
      );

      expect(() => schema.parse(validCharacter)).not.toThrow();
    });

    it("should reject invalid character entity type", () => {
      const schema = adapter.schema;

      const base = createTestEntity("brain-character", {
        id: "brain-character",
        content: "",
      });
      const invalidCharacter = {
        ...base,
        entityType: "other",
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
      };

      expect(() => schema.parse(invalidCharacter)).toThrow();
    });

    it("should reject invalid character ID", () => {
      const schema = adapter.schema;

      const base = createTestEntity("brain-character", {
        id: "wrong:id",
        content: "",
      });
      const invalidCharacter = {
        ...base,
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
      };

      expect(() => schema.parse(invalidCharacter)).toThrow();
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
    it("should convert character entity to frontmatter format", () => {
      const content = adapter.createCharacterContent({
        name: "Personal Brain",
        role: "Personal knowledge assistant",
        purpose:
          "Help organize, understand, and retrieve information from your personal knowledge base.",
        values: ["clarity", "accuracy", "helpfulness"],
      });

      const entity = createTestEntity<BrainCharacterEntity>("brain-character", {
        id: "brain-character",
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

  describe("parseCharacterBody", () => {
    it("should parse frontmatter format to character body", () => {
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

      const result = adapter.parseCharacterBody(markdown);

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

    it("should parse legacy structured markdown to character body", () => {
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

      const result = adapter.parseCharacterBody(markdown);

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

      expect(() => adapter.parseCharacterBody(markdown)).toThrow();
    });

    it("should throw error for empty markdown", () => {
      const markdown = "";

      expect(() => adapter.parseCharacterBody(markdown)).toThrow();
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

      expect(result.entityType).toBe("brain-character");
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

      expect(result.entityType).toBe("brain-character");
      // Legacy content should be converted to frontmatter format
      expect(result.content).toContain("---");
      expect(result.content).toContain("name: Research Brain");
      expect(result.content).toContain("role: Research assistant");
    });
  });

  describe("extractMetadata", () => {
    it("should extract role and values as metadata", () => {
      const content = adapter.createCharacterContent({
        name: "Team Brain",
        role: "Team coordinator",
        purpose: "Facilitate knowledge sharing across the organization",
        values: ["collaboration", "transparency", "accessibility"],
      });

      const entity = createTestEntity<BrainCharacterEntity>("brain-character", {
        id: "brain-character",
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
      const content = adapter.createCharacterContent({
        name: "Test Brain",
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
      });

      const entity = createTestEntity<BrainCharacterEntity>("brain-character", {
        id: "brain-character",
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
    it("should preserve data through createCharacterContent and parseCharacterBody", () => {
      const originalData = {
        name: "Personal Brain",
        role: "Personal knowledge assistant",
        purpose:
          "Help organize, understand, and retrieve information from your personal knowledge base.",
        values: ["clarity", "accuracy", "helpfulness"],
      };

      const content = adapter.createCharacterContent(originalData);
      const parsed = adapter.parseCharacterBody(content);

      expect(parsed.name).toBe(originalData.name);
      expect(parsed.role).toBe(originalData.role);
      expect(parsed.purpose).toBe(originalData.purpose);
      expect(parsed.values).toEqual(originalData.values);
    });

    it("should preserve data through toMarkdown and parseCharacterBody", () => {
      const originalData = {
        name: "Test Brain",
        role: "Test assistant",
        purpose: "Testing roundtrip",
        values: ["testing", "precision"],
      };

      const content = adapter.createCharacterContent(originalData);
      const entity = createTestEntity<BrainCharacterEntity>("brain-character", {
        id: "brain-character",
        content,
      });

      const markdown = adapter.toMarkdown(entity);
      const parsed = adapter.parseCharacterBody(markdown);

      expect(parsed.name).toBe(originalData.name);
      expect(parsed.role).toBe(originalData.role);
      expect(parsed.purpose).toBe(originalData.purpose);
      expect(parsed.values).toEqual(originalData.values);
    });
  });
});
