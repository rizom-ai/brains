import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPublishTool, publishInputSchema } from "../../src/tools/publish";
import { ProviderRegistry } from "../../src/provider-registry";
import type { PublishProvider } from "@brains/contracts";
import type { PublishResult } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import {
  createMockShell,
  type MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { ToolContext } from "@brains/plugins";

function createMockToolContext(): ToolContext {
  return {
    interfaceType: "test",
    userId: "test-user",
  };
}

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

async function runConfirmedPublish(
  tool: ReturnType<typeof createPublishTool>,
  input: Record<string, unknown>,
  context: ToolContext = createMockToolContext(),
): Promise<Awaited<ReturnType<typeof tool.handler>>> {
  const confirmation = await tool.handler(input, context);
  expect(confirmation).toHaveProperty("needsConfirmation", true);
  if (!("needsConfirmation" in confirmation)) {
    throw new Error("Expected publish confirmation");
  }
  return tool.handler(confirmation.args, context);
}

describe("Publish Pipeline - Publish Tool", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let providerRegistry: ProviderRegistry;
  const pluginId = "publish-pipeline";

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = createMockShell({ logger });
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

  describe("publish policy", () => {
    it("requires publish permission before direct publish", async () => {
      mockShell.getPermissionService = (): PermissionService =>
        new PermissionService({
          entityActions: { "social-post": { publish: "anchor" } },
        });
      context = createServicePluginContext(mockShell, pluginId);
      const tool = createPublishTool(context, pluginId, providerRegistry);

      const result = await tool.handler(
        { entityType: "social-post", id: "post-123" },
        { ...createMockToolContext(), userPermissionLevel: "trusted" },
      );

      expect(result).toEqual({
        success: false,
        error:
          "Publishing `social-post` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
      });
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
      if (!result.success) {
        expect(result.error).toContain("entityType");
      }
    });

    it("should require id or slug", async () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post" },
        createMockToolContext(),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("id");
      }
    });

    it("should return error when entity not found", async () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "nonexistent" },
        createMockToolContext(),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("publishing with provider", () => {
    beforeEach(async () => {
      // Create a draft post
      await context.entityService.createEntity({
        entity: {
          id: "draft-post",
          entityType: "social-post",
          content: "Test content to publish",
          visibility: "public",
          metadata: {
            slug: "draft-post",
            platform: "linkedin",
            status: "draft",
          },
        },
      });

      // Create an already published post
      await context.entityService.createEntity({
        entity: {
          id: "published-post",
          entityType: "social-post",
          content: "Already published content",
          visibility: "public",
          metadata: {
            slug: "published-post",
            platform: "linkedin",
            status: "published",
          },
        },
      });

      await context.entityService.createEntity({
        entity: {
          id: "shared-post",
          entityType: "social-post",
          content: "Shared content must not publish publicly",
          visibility: "shared",
          metadata: {
            slug: "shared-post",
            platform: "linkedin",
            status: "draft",
          },
        },
      });

      await context.entityService.createEntity({
        entity: {
          id: "restricted-post",
          entityType: "social-post",
          content: "Restricted content must not publish publicly",
          visibility: "restricted",
          metadata: {
            slug: "restricted-post",
            platform: "linkedin",
            status: "draft",
          },
        },
      });
    });

    it("requires confirmation before publishing with registered provider", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const confirmation = await tool.handler(
        { entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(confirmation).toHaveProperty("needsConfirmation", true);
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
      if (!("needsConfirmation" in confirmation)) {
        throw new Error("Expected publish confirmation");
      }
      expect(confirmation.summary).toBe('Publish "draft-post"?');

      const result = await tool.handler(
        confirmation.args,
        createMockToolContext(),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("platformId", "linkedin-post-123");
      }
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should return error when no provider registered", async () => {
      // No provider registered - should return error
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No publish provider registered");
      }
    });

    it("should reject already published entities", async () => {
      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "published-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already published");
      }
    });

    it("should reject shared entities before publishing publicly", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", id: "shared-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("visibility is shared");
      }
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
    });

    it("should reject restricted entities found by slug before publishing publicly", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await tool.handler(
        { entityType: "social-post", slug: "restricted-post" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("visibility is restricted");
      }
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
    });

    it("should find entity by slug", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await runConfirmedPublish(tool, {
        entityType: "social-post",
        slug: "draft-post",
      });

      expect(result.success).toBe(true);
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should update entity status after publishing", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createPublishTool(context, pluginId, providerRegistry);
      await runConfirmedPublish(tool, {
        entityType: "social-post",
        id: "draft-post",
      });

      // Verify entity was updated
      const updated = await context.entityService.getEntity({
        entityType: "social-post",
        id: "draft-post",
      });
      expect(updated?.metadata["status"]).toBe("published");
    });
  });

  describe("content processing", () => {
    it("should strip frontmatter from content before publishing", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      // Create post with frontmatter
      await context.entityService.createEntity({
        entity: {
          id: "frontmatter-post",
          entityType: "social-post",
          visibility: "public",
          content: `---
title: Test Post
platform: linkedin
status: draft
---
This is the actual post content.`,
          metadata: {
            slug: "frontmatter-post",
            platform: "linkedin",
            status: "draft",
          },
        },
      });

      const tool = createPublishTool(context, pluginId, providerRegistry);
      await runConfirmedPublish(tool, {
        entityType: "social-post",
        id: "frontmatter-post",
      });

      // Verify provider received only the body content, not frontmatter
      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "This is the actual post content.",
        expect.anything(),
        undefined,
        undefined,
      );
    });

    it("should pass image data when coverImageId is in frontmatter", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      // Create an image entity
      await context.entityService.createEntity({
        entity: {
          id: "test-cover-image",
          entityType: "image",
          visibility: "public",
          content:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          metadata: { slug: "test-cover-image" },
        },
      });

      // Create post with coverImageId in frontmatter
      await context.entityService.createEntity({
        entity: {
          id: "post-with-image",
          entityType: "social-post",
          visibility: "public",
          content: `---
title: Post With Image
platform: linkedin
status: draft
coverImageId: test-cover-image
---
Post content with an image.`,
          metadata: {
            slug: "post-with-image",
            platform: "linkedin",
            status: "draft",
          },
        },
      });

      const tool = createPublishTool(context, pluginId, providerRegistry);
      await runConfirmedPublish(tool, {
        entityType: "social-post",
        id: "post-with-image",
      });

      // Verify provider received image data
      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "Post content with an image.",
        expect.anything(),
        expect.objectContaining({
          mimeType: "image/png",
        }),
        undefined,
      );
    });

    it("should publish without image when coverImageId not found", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      // Create post with non-existent coverImageId
      await context.entityService.createEntity({
        entity: {
          id: "post-missing-image",
          entityType: "social-post",
          visibility: "public",
          content: `---
title: Post Missing Image
platform: linkedin
status: draft
coverImageId: nonexistent-image
---
Post content without image.`,
          metadata: {
            slug: "post-missing-image",
            platform: "linkedin",
            status: "draft",
          },
        },
      });

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await runConfirmedPublish(tool, {
        entityType: "social-post",
        id: "post-missing-image",
      });

      // Should still succeed, just without image
      expect(result.success).toBe(true);
      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "Post content without image.",
        expect.anything(),
        undefined,
        undefined,
      );
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
        entity: {
          id: "test-post",
          entityType: "social-post",
          content: "Test content",
          visibility: "public",
          metadata: { slug: "test", status: "draft" },
        },
      });

      const tool = createPublishTool(context, pluginId, providerRegistry);
      const result = await runConfirmedPublish(tool, {
        entityType: "social-post",
        id: "test-post",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("API rate limit");
      }
    });
  });
});
