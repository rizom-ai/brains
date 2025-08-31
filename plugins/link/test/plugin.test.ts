import { describe, it, expect, beforeEach } from "bun:test";
import { LinkPlugin, createLinkPlugin } from "../src/index";
import { LinkAdapter } from "../src/adapters/link-adapter";

describe("LinkPlugin", () => {
  let plugin: LinkPlugin;

  beforeEach(() => {
    plugin = createLinkPlugin({
      enableSummarization: true,
      autoTag: true,
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
      expect(defaultPlugin.config.enableSummarization).toBe(true);
      expect(defaultPlugin.config.autoTag).toBe(true);
    });

    it("should accept custom configuration", () => {
      const customPlugin = createLinkPlugin({
        enableSummarization: false,
        autoTag: false,
      }) as LinkPlugin;
      
      expect(customPlugin.config.enableSummarization).toBe(false);
      expect(customPlugin.config.autoTag).toBe(false);
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
        content: "# Test Article\n\nThis is the main content.",
        tags: ["test", "example"],
      });

      expect(linkBody).toContain("# Test Article");
      expect(linkBody).toContain("## URL");
      expect(linkBody).toContain("https://example.com/test");
      expect(linkBody).toContain("## Description");
      expect(linkBody).toContain("A test article");
      expect(linkBody).toContain("## Tags");
      expect(linkBody).toContain("- test");
      expect(linkBody).toContain("- example");
      expect(linkBody).toContain("## Domain");
      expect(linkBody).toContain("example.com");
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

## Tags

- test
- example

## Domain

example.com

## Captured

2025-01-30T10:00:00.000Z`;

      const parsed = adapter.parseLinkBody(sampleContent);

      expect(parsed.title).toBe("Test Article");
      expect(parsed.url).toBe("https://example.com/test");
      expect(parsed.description).toBe("A test article");
      expect(parsed.summary).toBe("This is a test article summary.");
      expect(parsed.tags).toEqual(["test", "example"]);
      expect(parsed.domain).toBe("example.com");
      expect(parsed.capturedAt).toBe("2025-01-30T10:00:00.000Z");
    });

    it("should convert entity to markdown", () => {
      const entity = {
        id: "test-id",
        entityType: "link" as const,
        content: "# Test Link\n\nContent here",
        metadata: {},
        createdAt: "2025-01-30T10:00:00.000Z",
        source: "plugin:link",
      };

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
      const entity = {
        id: "test-id",
        entityType: "link" as const,
        content: "# Test Link",
        metadata: {},
        createdAt: "2025-01-30T10:00:00.000Z",
        source: "plugin:link",
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({});
    });
  });
});