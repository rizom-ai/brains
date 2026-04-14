import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createMockShell } from "@brains/test-utils";
import type { LinkPlugin } from "../src/index";
import { createLinkPlugin } from "../src/index";
import { LinkAdapter } from "../src/adapters/link-adapter";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import packageJson from "../package.json";
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
      expect(plugin.version).toBe(packageJson.version);
    });

    it("should use default configuration when not provided", () => {
      const defaultPlugin = createLinkPlugin() as LinkPlugin;
      // Note: config is protected, so we test through behavior instead
      expect(defaultPlugin.id).toBe("link");
      expect(defaultPlugin.version).toBe(packageJson.version);
    });

    it("should accept custom configuration", () => {
      const customPlugin = createLinkPlugin({
        enableSummarization: false,
        autoExtractKeywords: false,
      }) as LinkPlugin;

      // Note: config is protected, so we test through behavior instead
      expect(customPlugin.id).toBe("link");
      expect(customPlugin.version).toBe(packageJson.version);
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
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: LinkPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

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
      expect(plugin.type).toBe("entity");
      expect(plugin.version).toBeDefined();
    });

    it("should not expose link_capture tool (moved to system_create)", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).not.toContain("link_capture");
      expect(capabilities.tools).toHaveLength(0);
    });

    it("should register both link:generation and link-capture job handlers", async () => {
      const registeredHandlers: string[] = [];
      const mockShell = createMockShell({ dataDir: "/tmp/test-datadir" });
      const origJobQueue = mockShell.getJobQueueService();
      const trackingJobQueue = {
        ...origJobQueue,
        registerHandler: (type: string): void => {
          registeredHandlers.push(type);
        },
      };
      mockShell.getJobQueueService = (): ReturnType<
        typeof mockShell.getJobQueueService
      > => trackingJobQueue as ReturnType<typeof mockShell.getJobQueueService>;

      await plugin.register(mockShell);

      expect(registeredHandlers).toContain("link:generation");
      expect(registeredHandlers).toContain("link-capture");
    });

    it("should register a create interceptor for link", () => {
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("link");
      expect(interceptor).toBeDefined();
    });

    it("should enqueue link-capture from the registered interceptor", async () => {
      const enqueued: Array<{ type: string; data: unknown }> = [];
      const mockShell = createMockShell({ dataDir: "/tmp/test-datadir" });
      const origJobQueue = mockShell.getJobQueueService();
      const trackingJobQueue = {
        ...origJobQueue,
        enqueue: async (type: string, data: unknown): Promise<string> => {
          enqueued.push({ type, data });
          return "job-123";
        },
      };
      mockShell.getJobQueueService = (): ReturnType<
        typeof mockShell.getJobQueueService
      > => trackingJobQueue as ReturnType<typeof mockShell.getJobQueueService>;

      await plugin.register(mockShell);
      const interceptor = mockShell
        .getEntityRegistry()
        .getCreateInterceptor("link");
      if (!interceptor) throw new Error("Expected link create interceptor");

      const result = await interceptor(
        {
          entityType: "link",
          prompt: "Save this: https://anthropic.com/research",
        },
        {
          interfaceType: "test",
          userId: "test-user",
          channelId: "!room:test",
          channelName: "#test",
        },
      );

      expect(result).toEqual({
        kind: "handled",
        result: {
          success: true,
          data: {
            status: "generating",
            jobId: "job-123",
          },
        },
      });
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]?.type).toBe("link-capture");
      expect(enqueued[0]?.data).toEqual({
        url: "https://anthropic.com/research",
        metadata: expect.objectContaining({
          interfaceId: "test",
          userId: "test-user",
          channelId: "!room:test",
          channelName: "#test",
          timestamp: expect.any(String),
        }),
      });
    });

    it("should direct-create valid link markdown from the registered interceptor", async () => {
      const markdown = `---
status: draft
title: Anthropic Research
url: https://anthropic.com/research
description: Research updates from Anthropic
keywords:
  - ai
  - research
domain: anthropic.com
capturedAt: "2026-04-14T08:00:00.000Z"
source:
  ref: "manual:local"
  label: MANUAL
---

A saved research link.`;

      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("link");
      if (!interceptor) throw new Error("Expected link create interceptor");

      const result = await interceptor(
        {
          entityType: "link",
          content: markdown,
        },
        {
          interfaceType: "test",
          userId: "test-user",
        },
      );

      expect(result).toEqual({
        kind: "handled",
        result: {
          success: true,
          data: {
            entityId: expect.any(String),
            status: "created",
          },
        },
      });
    });
  });
});
