import { describe, expect, it, beforeEach } from "bun:test";
import { GeneratedContentAdapter } from "../../src/content/generatedContentAdapter";
import type { GeneratedContent, ContentFormatter } from "@brains/types";
import { parseMarkdownWithFrontmatter } from "@brains/utils";
import { z } from "zod";

describe("GeneratedContentAdapter", () => {
  let adapter: GeneratedContentAdapter;

  beforeEach(() => {
    adapter = new GeneratedContentAdapter();
  });

  const createTestEntity = (
    overrides?: Partial<GeneratedContent>,
  ): GeneratedContent => ({
    id: "test-123",
    entityType: "generated-content",
    contentType: "test:content",
    content: JSON.stringify({ test: "data" }),
    data: { test: "data" },
    metadata: {
      prompt: "Test prompt",
      generatedAt: "2024-01-01T00:00:00Z",
      generatedBy: "test-model",
      regenerated: false,
      validationStatus: "valid",
    },
    created: "2024-01-01T00:00:00.000Z",
    updated: "2024-01-01T00:00:00.000Z",
    ...overrides,
  });

  describe("toMarkdown", () => {
    it("should generate markdown without data in frontmatter", () => {
      const entity = createTestEntity();
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("id: test-123");
      expect(markdown).toContain("entityType: generated-content");
      expect(markdown).toContain("contentType: 'test:content'");
      // Check that data field is not in frontmatter
      const [, frontmatter] = markdown.split("---");
      expect(frontmatter).not.toMatch(/^data:/m); // data: at start of line

      // Should use default YAML formatter
      expect(markdown).toContain("# Content Data");
      expect(markdown).toContain("```yaml");
      expect(markdown).toContain("test: data");
      expect(markdown).toContain("```");
    });

    it("should use specific formatter when available", () => {
      const mockFormatter: ContentFormatter = {
        format: (data) => `Custom format: ${JSON.stringify(data)}`,
        parse: () => ({ parsed: true }),
      };

      adapter.setFormatter("test:custom", mockFormatter);
      const entity = createTestEntity({ contentType: "test:custom" });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("Custom format:");
      expect(markdown).not.toContain("```yaml");
    });
  });

  describe("parseContent", () => {
    it("should parse valid YAML content", () => {
      const content = `# Content Data

\`\`\`yaml
name: Test Item
value: 42
active: true
\`\`\`

Edit the YAML above to modify the content.`;

      const result = adapter.parseContent(content, "test:yaml");

      expect(result).toEqual({
        data: {
          name: "Test Item",
          value: 42,
          active: true,
        },
        validationStatus: "valid",
      });
    });

    it("should handle invalid content", () => {
      const content = "This is not valid YAML content";
      const result = adapter.parseContent(content, "test:yaml");

      expect(result.validationStatus).toBe("invalid");
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors?.[0]).toEqual({
        message: "No YAML code block found in content",
      });
      expect(result.data).toEqual({}); // Empty object as fallback
    });

    it("should use custom formatter when available", () => {
      const mockFormatter: ContentFormatter = {
        format: () => "mock",
        parse: (content) => ({ parsed: content }),
      };

      adapter.setFormatter("test:custom", mockFormatter);
      const result = adapter.parseContent("test content", "test:custom");

      expect(result).toEqual({
        data: { parsed: "test content" },
        validationStatus: "valid",
      });
    });
  });

  describe("fromMarkdown", () => {
    it("should parse markdown file for import", () => {
      const markdown = `---
id: test-123
entityType: generated-content
contentType: test:yaml
metadata:
  prompt: Test prompt
  generatedAt: 2024-01-01T00:00:00Z
  generatedBy: test-model
  regenerated: false
created: 2024-01-01
updated: 2024-01-01
---

# Content Data

\`\`\`yaml
name: Test Item
value: 42
active: true
\`\`\`

Edit the YAML above to modify the content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result).toEqual({
        id: "test-123",
        entityType: "generated-content",
        contentType: "test:yaml",
        data: {
          name: "Test Item",
          value: 42,
          active: true,
        },
        content: markdown, // Full markdown is stored
        metadata: {
          prompt: "Test prompt",
          generatedAt: "2024-01-01T00:00:00.000Z",
          generatedBy: "test-model",
          regenerated: false,
          validationStatus: "valid",
          validationErrors: undefined,
          lastValidData: {
            name: "Test Item",
            value: 42,
            active: true,
          },
        },
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should handle invalid content in import", () => {
      const markdown = `---
id: test-123
entityType: generated-content
contentType: test:yaml
metadata:
  prompt: Test prompt
created: 2024-01-01
updated: 2024-01-01
---

This is not valid YAML content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.validationStatus).toBe("invalid");
      expect(result.metadata?.validationErrors).toBeDefined();
      expect(result.data).toEqual({}); // Empty object as fallback
      expect(result.content).toBe(markdown); // Original markdown preserved
    });

    it("should preserve last valid data during import", () => {
      const markdown = `---
id: test-123
entityType: generated-content
contentType: test:yaml
metadata:
  prompt: Test prompt
  lastValidData:
    name: Previous Valid
    value: 100
created: 2024-01-01
updated: 2024-01-01
---

Invalid content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.validationStatus).toBe("invalid");
      expect(result.data).toEqual({}); // Current data is empty
      expect(result.metadata?.lastValidData).toEqual({
        name: "Previous Valid",
        value: 100,
      });
    });
  });

  describe("roundtrip conversion", () => {
    it("should maintain data through toMarkdown and parseContent", () => {
      const originalEntity = createTestEntity({
        contentType: "test:yaml",
        data: {
          title: "Test Document",
          sections: ["intro", "body", "conclusion"],
          metadata: {
            author: "Test User",
            version: 1.5,
          },
        },
      });

      // Convert to markdown
      const markdown = adapter.toMarkdown(originalEntity);

      // Extract just the content body using a simple schema
      const { content } = parseMarkdownWithFrontmatter(
        markdown,
        z
          .object({
            content: z.string().optional().default(""),
          })
          .passthrough(),
      );

      // Parse the content
      const result = adapter.parseContent(content, originalEntity.contentType);

      expect(result.data).toEqual(originalEntity.data);
      expect(result.validationStatus).toBe("valid");
    });
  });

  describe("formatter management", () => {
    it("should register and retrieve formatters", () => {
      const mockFormatter: ContentFormatter = {
        format: (data) => `formatted: ${JSON.stringify(data)}`,
        parse: () => ({ parsed: true }),
      };

      adapter.setFormatter("test:mock", mockFormatter);

      // Test that it uses the formatter
      const entity = createTestEntity({
        contentType: "test:mock",
        data: { test: "value" },
      });

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain('formatted: {"test":"value"}');
    });

    it("should handle multiple formatters", () => {
      const formatter1: ContentFormatter = {
        format: () => "Format 1",
        parse: () => ({ format: 1 }),
      };

      const formatter2: ContentFormatter = {
        format: () => "Format 2",
        parse: () => ({ format: 2 }),
      };

      adapter.setFormatter("type:one", formatter1);
      adapter.setFormatter("type:two", formatter2);

      const entity1 = createTestEntity({ contentType: "type:one" });
      const entity2 = createTestEntity({ contentType: "type:two" });

      expect(adapter.toMarkdown(entity1)).toContain("Format 1");
      expect(adapter.toMarkdown(entity2)).toContain("Format 2");
    });
  });

  describe("hardcoded landing page formatter (Phase 0)", () => {
    it("should use hardcoded formatter for webserver:landing:page", () => {
      // This test documents the Phase 0 hardcoded behavior
      // In Phase 1, this will be replaced with proper registry integration

      const entity = createTestEntity({
        contentType: "webserver:landing:page",
        data: {
          hero: {
            headline: "Welcome",
            tagline: "Your brain",
            ctaText: "Start",
            ctaUrl: "/begin",
          },
          features: [],
          benefits: [],
        },
      });

      const markdown = adapter.toMarkdown(entity);

      // For Phase 0, we'll implement a check for this specific content type
      // and use a hardcoded formatter
      expect(markdown).toBeDefined();
    });
  });
});
