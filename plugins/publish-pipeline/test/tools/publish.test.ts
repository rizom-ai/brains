import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils";
import { createPublishTool, publishInputSchema } from "../../src/tools/publish";
import { ProviderRegistry } from "../../src/provider-registry";
import type { PublishProvider, PublishResult } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { ToolContext } from "@brains/plugins";

// Helper to create a mock tool context
const createMockToolContext = (): ToolContext =>
  ({
    routing: {
      source: "test",
      messageId: "test-msg",
      interface: "test",
      userId: "test-user",
    },
  }) as unknown as ToolContext;

// Create mock provider for testing
function createMockProvider(name: string): PublishProvider {
  return {
    name,
    publish: mock(
      async (): Promise<PublishResult> => ({
        id: `${name}-post-123`,
        url: `https://${name}.com/post/123`,
      }),
    ),
  };
}

describe("Publish Pipeline - Publish Tool", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let providerRegistry: ProviderRegistry;
  const pluginId = "publish-pipeline";

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, pluginId);
    providerRegistry = ProviderRegistry.createFresh();

    // Register the social-post entity type (MockShell just tracks registered types)
    mockShell
      .getEntityRegistry()
      .registerEntityType("social-post", z.any(), {} as never);
  });

  describe("createPublishTool", () => {
    it("should create a publish tool with correct name", () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      expect(tool.name).toBe("publish-pipeline_publish");
      expect(tool.handler).toBeDefined();
    });

    it("should have anchor visibility", () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      expect(tool.visibility).toBe("anchor");
    });

    it("should have description explaining direct publishing", () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      expect(tool.description.toLowerCase()).toContain("publish");
    });
  });

  describe("publishInputSchema", () => {
    it("should require entityType", () => {
      const result = publishInputSchema.safeParse({
        id: "post-123",
      });
      expect(result.success).toBe(false);
    });

    it("should accept entityType and id", () => {
      const result = publishInputSchema.safeParse({
        entityType: "social-post",
        id: "post-123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept entityType and slug", () => {
      const result = publishInputSchema.safeParse({
        entityType: "social-post",
        slug: "my-post",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("handler validation", () => {
    it("should require entityType", async () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { id: "post-123" },
        createMockToolContext(),
      );
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("entityType");
    });

    it("should require id or slug", async () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post" },
        createMockToolContext(),
      );
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("id");
    });

    it("should return error when entity not found", async () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "nonexistent" },
        createMockToolContext(),
      );
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not found");
    });
  });

  describe("publishing with provider", () => {
    beforeEach(async () => {
      // Create a draft post
      await context.entityService.createEntity({
        id: "draft-post",
        entityType: "social-post",
        content: "Test content to publish",
        metadata: {
          slug: "draft-post",
          platform: "linkedin",
          status: "draft",
        },
      });

      // Create an already published post
      await context.entityService.createEntity({
        id: "published-post",
        entityType: "social-post",
        content: "Already published content",
        metadata: {
          slug: "published-post",
          platform: "linkedin",
          status: "published",
        },
      });
    });

    it("should publish using registered provider", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result["data"]).toHaveProperty("platformId", "linkedin-post-123");
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should use default internal provider when none registered", async () => {
      // No provider registered - should use internal provider
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result["data"]).toHaveProperty("platformId", "internal");
    });

    it("should reject already published entities", async () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "published-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("already published");
    });

    it("should find entity by slug", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", slug: "draft-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should update entity status after publishing", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      await tool.handler(
        { entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      // Verify entity was updated
      const updated = await context.entityService.getEntity(
        "social-post",
        "draft-post",
      );
      expect(updated?.metadata?.["status"]).toBe("published");
    });
  });

  describe("provider errors", () => {
    it("should handle provider publish errors gracefully", async () => {
      const failingProvider: PublishProvider = {
        name: "failing",
        publish: mock(async () => {
          throw new Error("API rate limit exceeded");
        }),
      };
      providerRegistry.register("social-post", failingProvider);

      await context.entityService.createEntity({
        id: "test-post",
        entityType: "social-post",
        content: "Test content",
        metadata: { slug: "test", status: "draft" },
      });

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "test-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("API rate limit");
    });
  });
});
