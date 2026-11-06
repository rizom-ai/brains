import { describe, it, expect, beforeEach } from "bun:test";
import { createPublishingManageTool } from "../src/tools";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import type { ToolContext, ToolResponse } from "@brains/plugins";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import { PermissionService } from "@brains/templates";

/**
 * Queue actions of the publishing_manage tool:
 * - queue-list: list all queued items (optionally filtered by entityType)
 * - queue-add: add an entity to queue
 * - queue-remove: remove an entity from queue
 * - queue-reorder: change position of an entity
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

describe("publishing_manage queue actions", () => {
  let queueManager: QueueManager;
  let tool: ReturnType<typeof createPublishingManageTool>;
  let shell: ReturnType<typeof createMockShell>;

  const run = (
    input: Record<string, unknown>,
    toolContext: ToolContext = mockToolContext,
  ): Promise<ToolResponse> => tool.handler(input, toolContext);

  beforeEach(() => {
    permissionChecks.length = 0;
    queueManager = QueueManager.createFresh();
    shell = createMockShell();
    const permissionService = new PermissionService({});
    permissionService.assertEntityActionAllowed = (
      entityType,
      action,
      userPermissionLevel,
    ): void => {
      permissionChecks.push({ entityType, action, userPermissionLevel });
    };
    shell.getPermissionService = (): PermissionService => permissionService;
    const context = createServicePluginContext(shell, "content-pipeline");
    tool = createPublishingManageTool(context, {
      queueManager,
      providerRegistry: ProviderRegistry.createFresh(),
    });
  });

  describe("queue-list action", () => {
    it("should return empty queue when nothing is queued", async () => {
      const result = await run({ action: "queue-list" });
      expect(result).toEqual({
        success: true,
        data: { queue: [] },
        message: "No items in queue",
      });
    });

    it("should return all queued items when no entityType specified", async () => {
      await queueManager.add("social-post", "sp-1");
      await queueManager.add("blog-post", "bp-1");

      const result = await run({ action: "queue-list" });
      expect(result).toMatchObject({
        success: true,
        data: {
          queue: [{ entityType: "social-post" }, { entityType: "blog-post" }],
        },
        message: "2 items in queue",
      });
    });

    it("should filter by entityType when specified", async () => {
      await queueManager.add("social-post", "sp-1");
      await queueManager.add("social-post", "sp-2");
      await queueManager.add("blog-post", "bp-1");

      const result = await run({
        action: "queue-list",
        entityType: "social-post",
      });
      expect(result).toMatchObject({
        success: true,
        data: {
          queue: [{ entityType: "social-post" }, { entityType: "social-post" }],
        },
      });
    });
  });

  describe("queue-add action", () => {
    it("should require entityType", async () => {
      const result = await run({ action: "queue-add", entityId: "post-123" });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("entityType"),
      });
    });

    it("should require entityId", async () => {
      const result = await run({
        action: "queue-add",
        entityType: "social-post",
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("entityId"),
      });
    });

    it("should add entity to queue and return position", async () => {
      const result = await run({
        action: "queue-add",
        entityType: "social-post",
        entityId: "post-123",
      });
      expect(result).toMatchObject({
        success: true,
        data: { position: 1 },
        message: "Added to queue at position 1",
      });
    });

    it("queues an entity named by its title under its id", async () => {
      const now = new Date().toISOString();
      shell.addEntities([
        {
          id: "publish-policy-draft",
          entityType: "social-post",
          content: "Draft",
          contentHash: "hash",
          visibility: "public",
          metadata: { title: "Publish Policy Draft" },
          created: now,
          updated: now,
        },
      ]);

      const result = await run({
        action: "queue-add",
        entityType: "social-post",
        entityId: "Publish Policy Draft",
      });

      expect(result).toMatchObject({
        success: true,
        data: { entityId: "publish-policy-draft", position: 1 },
      });
      expect(await queueManager.list("social-post")).toMatchObject([
        { entityId: "publish-policy-draft" },
      ]);
    });

    it("should require publish permission", async () => {
      await run(
        {
          action: "queue-add",
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
      const add = (entityId: string): Promise<ToolResponse> =>
        run({ action: "queue-add", entityType: "social-post", entityId });

      await add("post-123");
      await add("post-456");

      const result = await add("post-123");
      expect(result).toMatchObject({ success: true, data: { position: 1 } });
    });
  });

  describe("queue-remove action", () => {
    it("should require entityType", async () => {
      const result = await run({
        action: "queue-remove",
        entityId: "post-123",
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("entityType"),
      });
    });

    it("should require entityId", async () => {
      const result = await run({
        action: "queue-remove",
        entityType: "social-post",
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("entityId"),
      });
    });

    it("should require update permission", async () => {
      await queueManager.add("social-post", "post-123");

      await run(
        {
          action: "queue-remove",
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
      await queueManager.add("social-post", "post-123");

      const result = await run({
        action: "queue-remove",
        entityType: "social-post",
        entityId: "post-123",
      });
      expect(result).toMatchObject({
        success: true,
        message: "Removed from queue",
      });

      expect(await queueManager.list("social-post")).toHaveLength(0);
    });
  });

  describe("queue-reorder action", () => {
    it("should require entityType", async () => {
      const result = await run({
        action: "queue-reorder",
        entityId: "post-123",
        position: 1,
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("entityType"),
      });
    });

    it("should require entityId", async () => {
      const result = await run({
        action: "queue-reorder",
        entityType: "social-post",
        position: 1,
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("entityId"),
      });
    });

    it("should require position", async () => {
      const result = await run({
        action: "queue-reorder",
        entityType: "social-post",
        entityId: "post-123",
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("position"),
      });
    });

    it("should reject position less than 1", async () => {
      const result = await run({
        action: "queue-reorder",
        entityType: "social-post",
        entityId: "post-123",
        position: 0,
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("position"),
      });
    });

    it("should reject a fractional position", async () => {
      await queueManager.add("social-post", "post-1");
      await queueManager.add("social-post", "post-2");

      const result = await run({
        action: "queue-reorder",
        entityType: "social-post",
        entityId: "post-2",
        position: 1.5,
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("position"),
      });

      const queue = await queueManager.list("social-post");
      expect(queue.map((entry) => entry.entityId)).toEqual([
        "post-1",
        "post-2",
      ]);
    });

    it("should require update permission", async () => {
      await queueManager.add("social-post", "post-1");
      await queueManager.add("social-post", "post-2");

      await run(
        {
          action: "queue-reorder",
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
      await queueManager.add("social-post", "post-1");
      await queueManager.add("social-post", "post-2");
      await queueManager.add("social-post", "post-3");

      const result = await run({
        action: "queue-reorder",
        entityType: "social-post",
        entityId: "post-3",
        position: 1,
      });
      expect(result).toMatchObject({
        success: true,
        data: { position: 1 },
        message: "Moved to position 1",
      });

      const queue = await queueManager.list("social-post");
      expect(queue.map((entry) => entry.entityId)).toEqual([
        "post-3",
        "post-1",
        "post-2",
      ]);
    });
  });
});
