import { describe, it, expect, beforeEach } from "bun:test";
import { createQueueTool, queueInputSchema } from "../src/tools/queue";
import { QueueManager } from "../src/queue-manager";
import { PublicationQueueService } from "../src/publication-queue-service";
import type { ToolContext } from "@brains/plugins";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import { PermissionService } from "@brains/templates";

/**
 * Tests for the unified publish_queue tool
 *
 * The tool should support:
 * - list: list all queued items (optionally filtered by entityType)
 * - add: add an entity to queue
 * - remove: remove an entity from queue
 * - reorder: change position of an entity
 */

const permissionChecks: Array<{
  entityType: string;
  action: Parameters<PermissionService["assertEntityActionAllowed"]>[1];
  userPermissionLevel: ToolContext["userPermissionLevel"];
}> = [];

const mockToolContext: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test-user" },
};

describe("publish_queue tool", () => {
  let queueManager: QueueManager;
  let tool: ReturnType<typeof createQueueTool>;
  let context: ReturnType<typeof createServicePluginContext>;

  beforeEach(async () => {
    permissionChecks.length = 0;
    queueManager = QueueManager.createFresh();
    const shell = createMockShell();
    const permissionService = new PermissionService({});
    permissionService.assertEntityActionAllowed = (
      entityType,
      action,
      userPermissionLevel,
    ): void => {
      permissionChecks.push({ entityType, action, userPermissionLevel });
    };
    shell.getPermissionService = (): PermissionService => permissionService;
    context = createServicePluginContext(shell, "publish-pipeline");
    for (const entityType of ["social-post", "blog-post"]) {
      context.entities.register(entityType, baseEntitySchema, {} as never);
    }
    for (const [entityType, id] of [
      ["social-post", "post-123"],
      ["social-post", "post-456"],
      ["social-post", "post-1"],
      ["social-post", "post-2"],
      ["social-post", "post-3"],
      ["social-post", "sp-1"],
      ["social-post", "sp-2"],
      ["blog-post", "bp-1"],
    ] as const) {
      await context.entityService.createEntity({
        entity: {
          id,
          entityType,
          content: `---\ntitle: ${id}\nstatus: draft\n---\n\nBody`,
          metadata: { title: id, status: "draft" },
        },
      });
    }
    const publicationQueueService = new PublicationQueueService(
      context,
      queueManager,
    );
    tool = createQueueTool(
      context,
      "publish-pipeline",
      queueManager,
      publicationQueueService,
    );
  });

  describe("input schema", () => {
    it("should accept list action without parameters", () => {
      const result = queueInputSchema.safeParse({
        action: "list",
      });
      expect(result.success).toBe(true);
    });

    it("should accept list action with entityType filter", () => {
      const result = queueInputSchema.safeParse({
        action: "list",
        entityType: "social-post",
      });
      expect(result.success).toBe(true);
    });

    it("should accept add action with entityType and entityId", () => {
      const result = queueInputSchema.safeParse({
        action: "add",
        entityType: "social-post",
        entityId: "post-123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept remove action with entityType and entityId", () => {
      const result = queueInputSchema.safeParse({
        action: "remove",
        entityType: "post",
        entityId: "post-456",
      });
      expect(result.success).toBe(true);
    });

    it("should accept reorder action with position", () => {
      const result = queueInputSchema.safeParse({
        action: "reorder",
        entityType: "deck",
        entityId: "deck-789",
        position: 1,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid action", () => {
      const result = queueInputSchema.safeParse({
        action: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("list action", () => {
    it("should return empty queue when nothing is queued", async () => {
      const result = await tool.handler({ action: "list" }, mockToolContext);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.queue).toEqual([]);
        expect(result.message).toBe("No items in queue");
      }
    });

    it("should return all queued items when no entityType specified", async () => {
      // Add items to different entity types
      await queueManager.add("social-post", "sp-1");
      await queueManager.add("blog-post", "bp-1");

      const result = await tool.handler({ action: "list" }, mockToolContext);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.queue).toHaveLength(2);
        expect(result.message).toBe("2 items in queue");
      }
    });

    it("should filter by entityType when specified", async () => {
      // Add items to different entity types
      await queueManager.add("social-post", "sp-1");
      await queueManager.add("social-post", "sp-2");
      await queueManager.add("blog-post", "bp-1");

      const result = await tool.handler(
        { action: "list", entityType: "social-post" },
        mockToolContext,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.queue).toHaveLength(2);
        expect(result.data?.queue?.[0]?.entityType).toBe("social-post");
        expect(result.data?.queue?.[1]?.entityType).toBe("social-post");
      }
    });
  });

  describe("add action", () => {
    it("should require entityType", async () => {
      const result = await tool.handler(
        { action: "add", entityId: "post-123" },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("entityType");
      }
    });

    it("should require entityId", async () => {
      const result = await tool.handler(
        { action: "add", entityType: "social-post" },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("entityId");
      }
    });

    it("should add entity to queue and return position", async () => {
      const result = await tool.handler(
        {
          action: "add",
          entityType: "social-post",
          entityId: "post-123",
        },
        mockToolContext,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.position).toBe(1);
        expect(result.message).toBe("Added to queue at position 1");
      }
    });

    // Tool mutations must run through PublicationQueueService so the
    // queued status is persisted on the entity, never only in memory.
    it("persists queued status on the entity", async () => {
      await tool.handler(
        { action: "add", entityType: "social-post", entityId: "post-123" },
        mockToolContext,
      );

      const entity = await context.entityService.getEntity({
        entityType: "social-post",
        id: "post-123",
      });
      expect(entity?.metadata["status"]).toBe("queued");

      await tool.handler(
        { action: "remove", entityType: "social-post", entityId: "post-123" },
        mockToolContext,
      );
      const removed = await context.entityService.getEntity({
        entityType: "social-post",
        id: "post-123",
      });
      expect(removed?.metadata["status"]).toBe("draft");
    });

    it("should require publish permission", async () => {
      await tool.handler(
        {
          action: "add",
          entityType: "social-post",
          entityId: "post-123",
        },
        { ...mockToolContext, userPermissionLevel: "trusted" },
      );

      expect(permissionChecks).toEqual([
        {
          entityType: "social-post",
          action: "publish",
          userPermissionLevel: "trusted",
        },
      ]);
    });

    it("should return existing position if already queued", async () => {
      // Add first
      await tool.handler(
        {
          action: "add",
          entityType: "social-post",
          entityId: "post-123",
        },
        mockToolContext,
      );

      // Add second item
      await tool.handler(
        {
          action: "add",
          entityType: "social-post",
          entityId: "post-456",
        },
        mockToolContext,
      );

      // Try to add first again
      const result = await tool.handler(
        {
          action: "add",
          entityType: "social-post",
          entityId: "post-123",
        },
        mockToolContext,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.position).toBe(1);
      }
    });
  });

  describe("remove action", () => {
    it("should require entityType", async () => {
      const result = await tool.handler(
        { action: "remove", entityId: "post-123" },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("entityType");
      }
    });

    it("should require entityId", async () => {
      const result = await tool.handler(
        { action: "remove", entityType: "social-post" },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("entityId");
      }
    });

    it("should require update permission", async () => {
      await queueManager.add("social-post", "post-123");

      await tool.handler(
        {
          action: "remove",
          entityType: "social-post",
          entityId: "post-123",
        },
        { ...mockToolContext, userPermissionLevel: "trusted" },
      );

      expect(permissionChecks).toEqual([
        {
          entityType: "social-post",
          action: "update",
          userPermissionLevel: "trusted",
        },
      ]);
    });

    it("should remove entity from queue", async () => {
      // First add
      await queueManager.add("social-post", "post-123");

      // Then remove
      const result = await tool.handler(
        {
          action: "remove",
          entityType: "social-post",
          entityId: "post-123",
        },
        mockToolContext,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toBe("Removed from queue");
      }

      // Verify removed
      const queue = await queueManager.list("social-post");
      expect(queue).toHaveLength(0);
    });
  });

  describe("reorder action", () => {
    it("should require entityType", async () => {
      const result = await tool.handler(
        { action: "reorder", entityId: "post-123", position: 1 },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("entityType");
      }
    });

    it("should require entityId", async () => {
      const result = await tool.handler(
        { action: "reorder", entityType: "social-post", position: 1 },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("entityId");
      }
    });

    it("should require position", async () => {
      const result = await tool.handler(
        {
          action: "reorder",
          entityType: "social-post",
          entityId: "post-123",
        },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("position");
      }
    });

    it("should reject position less than 1", async () => {
      const result = await tool.handler(
        {
          action: "reorder",
          entityType: "social-post",
          entityId: "post-123",
          position: 0,
        },
        mockToolContext,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("positive");
      }
    });

    it("should require update permission", async () => {
      await queueManager.add("social-post", "post-1");
      await queueManager.add("social-post", "post-2");

      await tool.handler(
        {
          action: "reorder",
          entityType: "social-post",
          entityId: "post-2",
          position: 1,
        },
        { ...mockToolContext, userPermissionLevel: "trusted" },
      );

      expect(permissionChecks).toEqual([
        {
          entityType: "social-post",
          action: "update",
          userPermissionLevel: "trusted",
        },
      ]);
    });

    it("should reorder entity in queue", async () => {
      // Add multiple items
      await queueManager.add("social-post", "post-1");
      await queueManager.add("social-post", "post-2");
      await queueManager.add("social-post", "post-3");

      // Move post-3 to position 1
      const result = await tool.handler(
        {
          action: "reorder",
          entityType: "social-post",
          entityId: "post-3",
          position: 1,
        },
        mockToolContext,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.position).toBe(1);
        expect(result.message).toBe("Moved to position 1");
      }

      // Verify order
      const queue = await queueManager.list("social-post");
      expect(queue[0]?.entityId).toBe("post-3");
      expect(queue[1]?.entityId).toBe("post-1");
      expect(queue[2]?.entityId).toBe("post-2");
    });
  });

  describe("tool metadata", () => {
    it("should have correct tool name", () => {
      expect(tool.name).toBe("publish-pipeline_queue");
    });

    it("should have appropriate description", () => {
      expect(tool.description).toContain("queue");
      expect(tool.description).toContain("all entity types");
    });

    it("should have admin visibility", () => {
      expect(tool.visibility).toBe("admin");
    });

    it("should declare write side effects", () => {
      expect(tool.sideEffects).toBe("writes");
    });

    it("should have output schema", () => {
      expect(tool.outputSchema).toBeDefined();
    });
  });
});
