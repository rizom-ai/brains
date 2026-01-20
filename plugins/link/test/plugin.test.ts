import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { LinkPlugin } from "../src/index";
import { createLinkPlugin } from "../src/index";
import { LinkAdapter } from "../src/adapters/link-adapter";
import { createServicePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import {
  createMockLinkEntity,
  mockLinkContent,
} from "./fixtures/link-entities";

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

    it("should create link content with frontmatter", () => {
      const linkContent = adapter.createLinkContent({
        status: "draft",
        title: "Test Article",
        url: "https://example.com/test",
        description: "A test article",
        summary: "This is a test article summary.",
        keywords: ["test", "example"],
        domain: "example.com",
        capturedAt: "2025-01-30T10:00:00.000Z",
        source: {
          ref: "cli:local",
          label: "CLI",
        },
      });

      // Check frontmatter (using regex to allow YAML quoting variations)
      expect(linkContent).toContain("---");
      expect(linkContent).toContain("status: draft");
      expect(linkContent).toContain("title: Test Article");
      expect(linkContent).toMatch(
        /url: ['"]?https:\/\/example\.com\/test['"]?/,
      );
      expect(linkContent).toContain("description: A test article");
      expect(linkContent).toContain("domain: example.com");
      expect(linkContent).toMatch(/ref: ['"]?cli:local['"]?/);
      expect(linkContent).toContain("label: CLI");
      // Check body (summary)
      expect(linkContent).toContain("This is a test article summary.");
    });

    it("should parse link content correctly", () => {
      const sampleContent = `---
status: draft
title: Test Article
url: https://example.com/test
description: A test article
keywords:
  - test
  - example
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "cli:local"
  label: CLI
---

This is a test article summary.`;

      const parsed = adapter.parseLinkContent(sampleContent);

      expect(parsed.frontmatter.title).toBe("Test Article");
      expect(parsed.frontmatter.url).toBe("https://example.com/test");
      expect(parsed.frontmatter.status).toBe("draft");
      expect(parsed.frontmatter.description).toBe("A test article");
      expect(parsed.frontmatter.keywords).toEqual(["test", "example"]);
      expect(parsed.frontmatter.domain).toBe("example.com");
      expect(parsed.frontmatter.capturedAt).toBe("2025-01-30T10:00:00.000Z");
      expect(parsed.frontmatter.source).toEqual({
        ref: "cli:local",
        label: "CLI",
      });
      expect(parsed.summary).toBe("This is a test article summary.");
    });

    it("should convert entity to markdown", () => {
      const entity = createMockLinkEntity({
        id: "test-id",
        content: mockLinkContent.simple,
        metadata: { status: "draft", title: "Test Article" },
      });

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain("---");
      expect(markdown).toContain("status: draft");
      expect(markdown).toContain("Test summary");
    });

    it("should convert markdown to entity with metadata from frontmatter", () => {
      const markdown = mockLinkContent.simple;
      const partialEntity = adapter.fromMarkdown(markdown);

      expect(partialEntity.content).toBe(markdown);
      expect(partialEntity.entityType).toBe("link");
      expect(partialEntity.metadata?.status).toBe("draft");
      expect(partialEntity.metadata?.title).toBe("Test Article");
    });

    it("should extract metadata from entity", () => {
      const entity = createMockLinkEntity({
        id: "test-id",
        content: mockLinkContent.simple,
        metadata: { status: "draft", title: "Test Article" },
      });

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({ status: "draft", title: "Test Article" });
    });
  });
});

describe("LinkPlugin with Harness", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
  let plugin: LinkPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createServicePluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = createLinkPlugin({
      enableSummarization: true,
      autoExtractKeywords: true,
    }) as LinkPlugin;
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("link");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should provide link_capture tool", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("link_capture");
    });
  });

  describe("Tool Schemas", () => {
    it("link_capture should require url parameter", () => {
      const captureTool = capabilities.tools.find(
        (t) => t.name === "link_capture",
      );
      expect(captureTool).toBeDefined();
      if (!captureTool) throw new Error("captureTool not found");
      expect(captureTool.inputSchema["url"]).toBeDefined();
    });
  });

  describe("Tool Execution", () => {
    it("link_capture should throw ZodError for invalid URL format", async () => {
      // Zod validation happens before try/catch in handler
      expect(
        harness.executeTool("link_capture", {
          url: "not-a-valid-url",
        }),
      ).rejects.toThrow();
    });

    it("link_capture should reject invalid domains", async () => {
      const result = await harness.executeTool("link_capture", {
        url: "https://this-domain-definitely-does-not-exist-xyz123.com/page",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
