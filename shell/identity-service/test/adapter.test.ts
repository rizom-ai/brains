import { describe, it, expect, beforeEach } from "bun:test";
import { IdentityAdapter } from "../src/adapter";
import type { IdentityEntity } from "../src/schema";
import { z } from "@brains/utils";

describe("IdentityAdapter", () => {
  let adapter: IdentityAdapter;

  beforeEach(() => {
    adapter = new IdentityAdapter();
  });

  describe("schema", () => {
    it("should have valid identity schema", () => {
      const schema = adapter.schema;

      const validIdentity = {
        id: "system:identity",
        entityType: "identity",
        content: "", // BaseEntity requires content field
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(validIdentity)).not.toThrow();
    });

    it("should reject invalid identity entity type", () => {
      const schema = adapter.schema;

      const invalidIdentity = {
        id: "system:identity",
        entityType: "other", // Wrong type
        content: "",
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(invalidIdentity)).toThrow();
    });

    it("should reject invalid identity ID", () => {
      const schema = adapter.schema;

      const invalidIdentity = {
        id: "wrong:id", // Must be "system:identity"
        entityType: "identity",
        content: "",
        role: "Assistant",
        purpose: "Help",
        values: ["clarity"],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(invalidIdentity)).toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should convert identity entity to structured markdown", () => {
      // Create identity content
      const content = adapter.createIdentityContent({
        role: "Personal knowledge assistant",
        purpose:
          "Help organize, understand, and retrieve information from your personal knowledge base.",
        values: ["clarity", "accuracy", "helpfulness"],
      });

      const entity: IdentityEntity = {
        id: "system:identity",
        entityType: "identity",
        content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

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

## Role
Research assistant

## Purpose
Help organize research papers and maintain literature review notes.

## Values

- academic rigor
- citation accuracy
- critical thinking`;

      const result = adapter.parseIdentityBody(markdown);

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

    it("should handle markdown without proper structure", () => {
      const markdown = "Some random text without structure";

      const result = adapter.parseIdentityBody(markdown);

      expect(result.role).toBe("");
      expect(result.purpose).toBe("");
      expect(result.values).toEqual([]);
    });

    it("should handle empty markdown", () => {
      const markdown = "";

      const result = adapter.parseIdentityBody(markdown);

      expect(result.role).toBe("");
      expect(result.purpose).toBe("");
      expect(result.values).toEqual([]);
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
        role: "Team coordinator",
        purpose: "Facilitate knowledge sharing across the organization",
        values: ["collaboration", "transparency", "accessibility"],
      });

      const entity: IdentityEntity = {
        id: "system:identity",
        entityType: "identity",
        content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        role: "Team coordinator",
        values: ["collaboration", "transparency", "accessibility"],
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should return empty string (identity uses structured content, not frontmatter)", () => {
      const entity: IdentityEntity = {
        id: "system:identity",
        entityType: "identity",
        content: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

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
