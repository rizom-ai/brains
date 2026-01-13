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

      // Create base entity with wrong type - use spread to override
      const base = createTestEntity("identity", {
        id: "identity",
        content: "",
      });
      const invalidIdentity = {
        ...base,
        entityType: "other", // Wrong type
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
      };

      expect(() => schema.parse(invalidIdentity)).toThrow();
    });

    it("should reject invalid identity ID", () => {
      const schema = adapter.schema;

      // Create base entity with wrong id - use spread to override
      const base = createTestEntity("identity", {
        id: "wrong:id", // Must be "identity"
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

  describe("toMarkdown", () => {
    it("should convert identity entity to structured markdown", () => {
      // Create identity content
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

      // Should contain structured content
      expect(markdown).toContain("# Brain Identity");
      expect(markdown).toContain("## Role");
      expect(markdown).toContain("Personal knowledge assistant");
      expect(markdown).toContain("## Purpose");
      expect(markdown).toContain(
        "Help organize, understand, and retrieve information",
      );
      expect(markdown).toContain("## Values");
      expect(markdown).toContain("- clarity");
      expect(markdown).toContain("- accuracy");
      expect(markdown).toContain("- helpfulness");
    });
  });

  describe("parseIdentityBody", () => {
    it("should parse structured markdown to identity body", () => {
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

      expect(() => adapter.parseIdentityBody(markdown)).toThrow(
        "Failed to parse structured content",
      );
    });

    it("should throw error for empty markdown", () => {
      const markdown = "";

      expect(() => adapter.parseIdentityBody(markdown)).toThrow(
        "Failed to parse structured content",
      );
    });
  });

  describe("fromMarkdown", () => {
    it("should create partial entity from markdown", () => {
      const markdown = `# Brain Identity

## Role
Research assistant

## Purpose
Help organize research papers and maintain literature review notes.

## Values

- academic rigor
- citation accuracy
- critical thinking`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("identity");
      expect(result.content).toBe(markdown);
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
    it("should return empty string (identity uses structured content, not frontmatter)", () => {
      const entity = createTestEntity<IdentityEntity>("identity", {
        id: "identity",
        content: "",
      });

      const result = adapter.generateFrontMatter(entity);

      expect(result).toBe("");
    });
  });

  describe("parseFrontMatter", () => {
    it("should return empty object (identity doesn't use frontmatter)", () => {
      const markdown = `---
role: Assistant
---

Content`;

      const result = adapter.parseFrontMatter(markdown, z.object({}));

      expect(result).toEqual({});
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

      // Create content
      const content = adapter.createIdentityContent(originalData);

      // Parse it back
      const parsed = adapter.parseIdentityBody(content);

      // Should preserve role, purpose, and values
      expect(parsed.role).toBe(originalData.role);
      expect(parsed.purpose).toBe(originalData.purpose);
      expect(parsed.values).toEqual(originalData.values);
    });
  });
});
