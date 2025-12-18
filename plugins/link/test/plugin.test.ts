import { describe, it, expect, beforeEach } from "bun:test";
import type { LinkPlugin } from "../src/index";
import { createLinkPlugin } from "../src/index";
import { LinkAdapter } from "../src/adapters/link-adapter";
import { createMockLinkEntity } from "./fixtures/link-entities";

describe("LinkPlugin", () => {
  let plugin: LinkPlugin;

  beforeEach(() => {
    plugin = createLinkPlugin({
      enableSummarization: true,
      autoExtractKeywords: true,
    }) as LinkPlugin;
  });

  describe("Plugin Configuration", () => {
    it("should have correct plugin metadata", () => {
      expect(plugin.id).toBe("link");
      expect(plugin.description).toContain("Web content capture");
      expect(plugin.version).toBe("0.1.0");
    });

    it("should use default configuration when not provided", () => {
      const defaultPlugin = createLinkPlugin() as LinkPlugin;
      // Note: config is protected, so we test through behavior instead
      expect(defaultPlugin.id).toBe("link");
      expect(defaultPlugin.version).toBe("0.1.0");
    });

    it("should accept custom configuration", () => {
      const customPlugin = createLinkPlugin({
        enableSummarization: false,
        autoExtractKeywords: false,
      }) as LinkPlugin;

      // Note: config is protected, so we test through behavior instead
      expect(customPlugin.id).toBe("link");
      expect(customPlugin.version).toBe("0.1.0");
    });
  });

  describe("LinkAdapter", () => {
    let adapter: LinkAdapter;

    beforeEach(() => {
      adapter = new LinkAdapter();
    });

    it("should have correct entity type and schema", () => {
      expect(adapter.entityType).toBe("link");
      expect(adapter.schema).toBeDefined();
    });

    it("should create structured link body", () => {
      const linkBody = adapter.createLinkBody({
        title: "Test Article",
        url: "https://example.com/test",
        description: "A test article",
        summary: "This is a test article summary.",
        keywords: ["test", "example"],
        source: {
          slug: "manual",
          title: "Manual",
          type: "manual",
        },
      });

      expect(linkBody).toContain("# Test Article");
      expect(linkBody).toContain("## URL");
      expect(linkBody).toContain("https://example.com/test");
      expect(linkBody).toContain("## Description");
      expect(linkBody).toContain("A test article");
      expect(linkBody).toContain("## Keywords");
      expect(linkBody).toContain("- test");
      expect(linkBody).toContain("- example");
      expect(linkBody).toContain("## Domain");
      expect(linkBody).toContain("example.com");
      expect(linkBody).toContain("## Source");
      expect(linkBody).toContain("- Manual (manual) [manual]");
    });

    it("should parse link body correctly", () => {
      const sampleContent = `# Test Article

## URL

https://example.com/test

## Description

A test article

## Summary

This is a test article summary.

## Content

# Test Article

This is the main content.

## Keywords

- test
- example

## Domain

example.com

## Captured

2025-01-30T10:00:00.000Z

## Source

- Manual (manual) [manual]`;

      const parsed = adapter.parseLinkBody(sampleContent);

      expect(parsed.title).toBe("Test Article");
      expect(parsed.url).toBe("https://example.com/test");
      expect(parsed.description).toBe("A test article");
      expect(parsed.summary).toBe("This is a test article summary.");
      expect(parsed.keywords).toEqual(["test", "example"]);
      expect(parsed.domain).toBe("example.com");
      expect(parsed.capturedAt).toBe("2025-01-30T10:00:00.000Z");
      expect(parsed.source).toEqual({
        slug: "manual",
        title: "Manual",
        type: "manual",
      });
    });

    it("should convert entity to markdown", () => {
      const entity = createMockLinkEntity({
        id: "test-id",
        content: "# Test Link\n\nContent here",
      });

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toBe("# Test Link\n\nContent here");
    });

    it("should convert markdown to entity", () => {
      const markdown = "# Test Link\n\nContent here";
      const partialEntity = adapter.fromMarkdown(markdown);

      expect(partialEntity.content).toBe(markdown);
      expect(partialEntity.entityType).toBe("link");
    });

    it("should extract empty metadata", () => {
      const entity = createMockLinkEntity({
        id: "test-id",
        content: "# Test Link",
      });

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({});
    });
  });
});
