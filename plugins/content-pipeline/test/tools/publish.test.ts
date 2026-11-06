import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  createPublishingManageTool,
  publishingManageInputSchema,
} from "../../src/tools";
import { QueueManager } from "../../src/queue-manager";
import { ProviderRegistry } from "../../src/provider-registry";
import type { PublishProvider } from "@brains/contracts";
import type { PublishResult } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import {
  baseEntitySchema,
  createMockShell,
  type MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import type { ToolContext } from "@brains/plugins";

function createMockToolContext(): ToolContext {
  return {
    interfaceType: "test",
    actor: { kind: "user", userId: "test-user" },
  };
}

// Create mock provider for testing
function createMockProvider(name: string): PublishProvider {
  return {
    name,
    publish: mock(async (): Promise<PublishResult> => ({
      id: `${name}-post-123`,
      url: `https://${name}.com/post/123`,
    })),
  };
}

async function runConfirmedPublish(
  tool: ReturnType<typeof createPublishingManageTool>,
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

describe("publishing_manage publish action", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let providerRegistry: ProviderRegistry;
  const pluginId = "content-pipeline";

  const createTool = (): ReturnType<typeof createPublishingManageTool> =>
    createPublishingManageTool(context, {
      queueManager: QueueManager.createFresh(),
      providerRegistry,
    });

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = createMockShell({ logger });
    context = createServicePluginContext(mockShell, pluginId);
    providerRegistry = ProviderRegistry.createFresh();

    // Register the social-post entity type (MockShell just tracks registered types)
    mockShell
      .getEntityRegistry()
      .registerEntityType(
        "social-post",
        baseEntitySchema.partial().passthrough(),
        createTestEntityAdapter("social-post"),
      );
  });

  describe("publish policy", () => {
    it("requires publish permission before direct publish", async () => {
      mockShell.getPermissionService = (): PermissionService =>
        new PermissionService({
          entityActions: { "social-post": { publish: "admin" } },
        });
      context = createServicePluginContext(mockShell, pluginId);
      const tool = createTool();

      const result = await tool.handler(
        { action: "publish", entityType: "social-post", id: "post-123" },
        { ...createMockToolContext(), userPermissionLevel: "trusted" },
      );

      expect(result).toEqual({
        success: false,
        error:
          "Publishing `social-post` requires Admin permission; your current permission is Trusted.",
      });
    });
  });

  describe("handler validation", () => {
    it("should require entityType", async () => {
      const tool = createTool();
      const result = await tool.handler(
        { action: "publish", id: "post-123" },
        createMockToolContext(),
      );
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("entityType"),
      });
    });

    it("should require id or slug", async () => {
      const tool = createTool();
      const result = await tool.handler(
        { action: "publish", entityType: "social-post" },
        createMockToolContext(),
      );
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("id"),
      });
    });

    it("should return error when entity not found", async () => {
      const tool = createTool();
      const result = await tool.handler(
        { action: "publish", entityType: "social-post", id: "nonexistent" },
        createMockToolContext(),
      );
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("not found"),
      });
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

      const tool = createTool();
      const confirmation = await tool.handler(
        { action: "publish", entityType: "social-post", id: "draft-post" },
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
      expect(result).toMatchObject({
        success: true,
        data: { platformId: "linkedin-post-123" },
      });
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("accepts confirmation after tool recreation", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const initialTool = createTool();
      const confirmation = await initialTool.handler(
        { action: "publish", entityType: "social-post", slug: "draft-post" },
        createMockToolContext(),
      );

      expect(confirmation).toHaveProperty("needsConfirmation", true);
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
      if (!("needsConfirmation" in confirmation)) {
        throw new Error("Expected publish confirmation");
      }
      expect(confirmation.args).toHaveProperty("expiresAt");

      const recreatedTool = createTool();
      const result = await recreatedTool.handler(
        confirmation.args,
        createMockToolContext(),
      );

      expect(result).toMatchObject({ success: true });
      expect(linkedinProvider.publish).toHaveBeenCalledTimes(1);
    });

    it("returns an error instead of re-confirming for invalid tokens", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createTool();
      const confirmation = await tool.handler(
        { action: "publish", entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(confirmation).toHaveProperty("needsConfirmation", true);
      if (!("needsConfirmation" in confirmation)) {
        throw new Error("Expected publish confirmation");
      }

      const result = await tool.handler(
        {
          ...publishingManageInputSchema.parse(confirmation.args),
          confirmationToken: "invalid-token",
        },
        createMockToolContext(),
      );

      expect(result).not.toHaveProperty("needsConfirmation");
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("Invalid publish confirmation token"),
      });
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
    });

    it("returns an error for expired confirmation tokens", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createTool();
      const confirmation = await tool.handler(
        { action: "publish", entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(confirmation).toHaveProperty("needsConfirmation", true);
      if (!("needsConfirmation" in confirmation)) {
        throw new Error("Expected publish confirmation");
      }

      const originalDateNow = Date.now;
      try {
        Date.now = (): number => originalDateNow() + 16 * 60 * 1000;
        const result = await tool.handler(
          confirmation.args,
          createMockToolContext(),
        );

        expect(result).not.toHaveProperty("needsConfirmation");
        expect(result).toMatchObject({
          success: false,
          error: expect.stringContaining("Publish confirmation expired"),
        });
        expect(linkedinProvider.publish).not.toHaveBeenCalled();
      } finally {
        Date.now = originalDateNow;
      }
    });

    it("rejects publish when content changed after confirmation", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createTool();
      const confirmation = await tool.handler(
        { action: "publish", entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(confirmation).toHaveProperty("needsConfirmation", true);
      if (!("needsConfirmation" in confirmation)) {
        throw new Error("Expected publish confirmation");
      }

      const entity = await context.entityService.getEntity({
        entityType: "social-post",
        id: "draft-post",
      });
      if (!entity) throw new Error("Expected draft entity");
      await context.entityService.updateEntity({
        entity: {
          ...entity,
          content: "Changed content after confirmation",
        },
      });

      const result = await tool.handler(
        confirmation.args,
        createMockToolContext(),
      );

      expect(result).toMatchObject({
        success: false,

        error: expect.stringContaining("changed after confirmation"),
      });
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
    });

    it("should return error when no provider registered", async () => {
      // No provider registered - should return error
      const tool = createTool();
      const result = await tool.handler(
        { action: "publish", entityType: "social-post", id: "draft-post" },
        createMockToolContext(),
      );

      expect(result).toMatchObject({
        success: false,

        error: expect.stringContaining("No publish provider registered"),
      });
    });

    it("should reject already published entities", async () => {
      const tool = createTool();
      const result = await tool.handler(
        { action: "publish", entityType: "social-post", id: "published-post" },
        createMockToolContext(),
      );

      expect(result).toMatchObject({
        success: false,

        error: expect.stringContaining("already published"),
      });
    });

    it("should reject shared entities before publishing publicly", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createTool();
      const result = await tool.handler(
        { action: "publish", entityType: "social-post", id: "shared-post" },
        createMockToolContext(),
      );

      expect(result).toMatchObject({
        success: false,

        error: expect.stringContaining("visibility is shared"),
      });
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
    });

    it("should reject restricted entities found by slug before publishing publicly", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createTool();
      const result = await tool.handler(
        {
          action: "publish",
          entityType: "social-post",
          slug: "restricted-post",
        },
        createMockToolContext(),
      );

      expect(result).toMatchObject({
        success: false,

        error: expect.stringContaining("visibility is restricted"),
      });
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
    });

    it("should find entity by slug", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createTool();
      const result = await runConfirmedPublish(tool, {
        action: "publish",
        entityType: "social-post",
        slug: "draft-post",
      });

      expect(result).toMatchObject({ success: true });
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should update entity status after publishing", async () => {
      const linkedinProvider = createMockProvider("linkedin");
      providerRegistry.register("social-post", linkedinProvider);

      const tool = createTool();
      await runConfirmedPublish(tool, {
        action: "publish",
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

      const tool = createTool();
      await runConfirmedPublish(tool, {
        action: "publish",
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

      const tool = createTool();
      await runConfirmedPublish(tool, {
        action: "publish",
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

      const tool = createTool();
      const result = await runConfirmedPublish(tool, {
        action: "publish",
        entityType: "social-post",
        id: "post-missing-image",
      });

      // Should still succeed, just without image
      expect(result).toMatchObject({ success: true });
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

      const tool = createTool();
      const result = await runConfirmedPublish(tool, {
        action: "publish",
        entityType: "social-post",
        id: "test-post",
      });

      expect(result).toMatchObject({
        success: false,

        error: expect.stringContaining("API rate limit"),
      });
    });
  });
});
