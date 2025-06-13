import { describe, expect, it, beforeEach } from "bun:test";
import { GeneratedContentAdapter } from "../../src/content/generatedContentAdapter";
import type { GeneratedContent, ContentFormatter } from "@brains/types";
import { createSilentLogger } from "@brains/utils";

describe("GeneratedContentAdapter", () => {
  let adapter: GeneratedContentAdapter;

  beforeEach(() => {
    const silentLogger = createSilentLogger("test");
    adapter = GeneratedContentAdapter.createFresh(silentLogger);
  });

  const createTestEntity = (
    overrides?: Partial<GeneratedContent>,
  ): GeneratedContent => ({
    id: "test-123",
    entityType: "generated-content",
    contentType: "test:content",
    content: `---
id: test-123
entityType: generated-content
contentType: 'test:content'
generatedBy: test-model
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---
{ "test": "data" }`,
    generatedBy: "test-model",
    created: "2024-01-01T00:00:00.000Z",
    updated: "2024-01-01T00:00:00.000Z",
    ...overrides,
  });

  describe("toMarkdown", () => {
    it("should generate markdown with only body content", () => {
      const entity = createTestEntity();
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("id: test-123");
      expect(markdown).toContain("entityType: generated-content");
      expect(markdown).toContain("contentType: 'test:content'");
      // Check that data field is not in frontmatter
      const [, frontmatter] = markdown.split("---");
      expect(frontmatter).not.toMatch(/^data:/m); // data: at start of line

      // Should contain the body content
      expect(markdown).toContain('{ "test": "data" }');
    });

    it("should use existing content when entity has no data (git sync scenario)", () => {
      // This simulates the git sync scenario where entity is loaded from DB
      // with formatted content but no data field
      const formattedContent = `---
id: existing-123
entityType: generated-content
contentType: 'webserver:landing:features'
generatedBy: claude
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---
# Features Section

## Label
Features

## Headline
Amazing Features

## Description
Our best features yet

## Feature Cards
- Lightning fast
- Secure by default
- Easy to use`;

      const entity = createTestEntity({
        id: "existing-123",
        contentType: "webserver:section:features",
        content: formattedContent, // Pre-formatted content
      });

      const markdown = adapter.toMarkdown(entity);

      // Should extract just the body content (without frontmatter)
      expect(markdown).toContain("# Features Section");
      expect(markdown).toContain("## Label\nFeatures");
      expect(markdown).toContain("## Headline\nAmazing Features");
      expect(markdown).toContain("## Feature Cards");

      // Should have new frontmatter with current entity data
      expect(markdown).toContain("id: existing-123");
      expect(markdown).toContain("contentType: 'webserver:section:features'");
    });

    it("should handle entity with no content gracefully", () => {
      const entity = createTestEntity({
        content: "",
      });

      const markdown = adapter.toMarkdown(entity);

      // Should still generate valid markdown with frontmatter
      expect(markdown).toContain("---");
      expect(markdown).toContain("id: test-123");

      // Content should be empty after frontmatter
      const parts = markdown.split("---");
      expect(parts.length).toBe(3); // Two dashes create 3 parts
      expect(parts[2]?.trim()).toBe(""); // Content after frontmatter should be empty
    });

    it("should use specific formatter when available", () => {
      const mockFormatter: ContentFormatter = {
        format: (data) => `Custom format: ${JSON.stringify(data)}`,
        parse: () => ({ parsed: true }),
      };

      adapter.setFormatter("test:custom", mockFormatter);
      const entity = createTestEntity({
        contentType: "test:custom",
        content: `---
id: test-123
entityType: generated-content
contentType: 'test:custom'
generatedBy: test-model
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---
Custom format: {"test":"data"}`,
      });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("Custom format:");
      expect(markdown).not.toContain("```yaml");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse markdown file for import", () => {
      const markdown = `---
id: test-123
entityType: generated-content
contentType: test:yaml
generatedBy: test-model
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
        content: markdown, // Full markdown is stored
        generatedBy: "test-model",
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should handle content that cannot be parsed", () => {
      const markdown = `---
id: test-123
entityType: generated-content
contentType: test:yaml
generatedBy: test-model
created: 2024-01-01
updated: 2024-01-01
---

This is not valid YAML content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.content).toBe(markdown); // Original markdown preserved
    });
  });

  describe("roundtrip conversion", () => {
    it("should maintain data through toMarkdown and fromMarkdown", () => {
      const originalEntity = createTestEntity({
        contentType: "test:yaml",
        content: `---
id: test-123
entityType: generated-content
contentType: test:yaml
generatedBy: test-model
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---

# Content Data

\`\`\`yaml
title: Test Document
sections:
  - intro
  - body
  - conclusion
metadata:
  author: Test User
  version: 1.5
\`\`\``,
      });

      // Convert to markdown
      const markdown = adapter.toMarkdown(originalEntity);

      // Parse it back
      const result = adapter.fromMarkdown(markdown);

      expect(result.contentType).toBe(originalEntity.contentType);
      expect(result.generatedBy).toBe(originalEntity.generatedBy);

      // Verify content was preserved correctly
      expect(result.content).toContain("title: Test Document");
      expect(result.content).toContain("author: Test User");
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
        content: `---
id: test-123
entityType: generated-content
contentType: 'test:mock'
generatedBy: test-model
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---
formatted: {"test":"value"}`,
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

      const entity1 = createTestEntity({
        contentType: "type:one",
        content: `---
id: test-123
entityType: generated-content
contentType: 'type:one'
generatedBy: test-model
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---
Format 1`,
      });
      const entity2 = createTestEntity({
        contentType: "type:two",
        content: `---
id: test-123
entityType: generated-content
contentType: 'type:two'
generatedBy: test-model
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---
Format 2`,
      });

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
        content: `---
id: test-123
entityType: generated-content
contentType: webserver:landing:page
generatedBy: test-model
created: '2024-01-01T00:00:00.000Z'
updated: '2024-01-01T00:00:00.000Z'
---

# Hero Section

## Headline
Welcome

## Tagline
Your brain

## CTA
- Text: Start
- URL: /begin

# Features

# Benefits`,
      });

      const markdown = adapter.toMarkdown(entity);

      // For Phase 0, we'll implement a check for this specific content type
      // and use a hardcoded formatter
      expect(markdown).toBeDefined();
    });
  });
});
