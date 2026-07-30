import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { PublishProvider, PublishResult } from "@brains/contracts";
import type { ToolContext } from "@brains/plugins";
import {
  createMockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import {
  createPublishingManageTool,
  publishingManageInputSchema,
} from "../../src/tools";
import { ProviderRegistry } from "../../src/provider-registry";
import { QueueManager } from "../../src/queue-manager";

function createMockToolContext(): ToolContext {
  return {
    interfaceType: "test",
    actor: { kind: "user", userId: "test-user" },
  };
}

function createMockProvider(name: string): PublishProvider {
  return {
    name,
    publish: mock(async (): Promise<PublishResult> => ({
      id: `${name}-post-123`,
      url: `https://${name}.com/post/123`,
    })),
  };
}

describe("publishing_manage tool", () => {
  let context: ServicePluginContext;
  let providerRegistry: ProviderRegistry;
  let queueManager: QueueManager;
  let tool: ReturnType<typeof createPublishingManageTool>;

  beforeEach(async () => {
    const shell = createMockShell();
    context = createServicePluginContext(shell, "content-pipeline");
    providerRegistry = ProviderRegistry.createFresh();
    queueManager = QueueManager.createFresh();
    tool = createPublishingManageTool(context, {
      queueManager,
      providerRegistry,
    });

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
  });

  it("registers one canonical publishing tool", () => {
    expect(tool.name).toBe("publishing_manage");
    expect(tool.visibility).toBe("admin");
    expect(tool.sideEffects).toBe("external");
  });

  it("accepts strict publishing lifecycle actions", () => {
    expect(
      publishingManageInputSchema.safeParse({ action: "queue-list" }).success,
    ).toBe(true);
    expect(
      publishingManageInputSchema.safeParse({
        action: "queue-add",
        entityType: "social-post",
        entityId: "draft-post",
      }).success,
    ).toBe(true);
    expect(
      publishingManageInputSchema.safeParse({
        action: "queue-remove",
        entityType: "social-post",
        entityId: "draft-post",
      }).success,
    ).toBe(true);
    expect(
      publishingManageInputSchema.safeParse({
        action: "queue-reorder",
        entityType: "social-post",
        entityId: "draft-post",
        position: 1,
      }).success,
    ).toBe(true);
    expect(
      publishingManageInputSchema.safeParse({
        action: "publish",
        entityType: "social-post",
        id: "draft-post",
      }).success,
    ).toBe(true);
    expect(
      publishingManageInputSchema.safeParse({ action: "queue" }).success,
    ).toBe(false);
  });

  it("manages queue actions through action-specific inputs", async () => {
    const addResult = await tool.handler(
      {
        action: "queue-add",
        entityType: "social-post",
        entityId: "draft-post",
      },
      createMockToolContext(),
    );
    if ("needsConfirmation" in addResult) {
      throw new Error("Expected queue add result");
    }
    expect(addResult.success).toBe(true);

    const listResult = await tool.handler(
      { action: "queue-list", entityType: "social-post" },
      createMockToolContext(),
    );
    if ("needsConfirmation" in listResult) {
      throw new Error("Expected queue list result");
    }
    expect(listResult.success).toBe(true);
    const queue = await queueManager.list("social-post");
    expect(queue).toHaveLength(1);
    expect(queue[0]?.entityId).toBe("draft-post");
  });

  it("returns confirmations with canonical tool name and action", async () => {
    const provider = createMockProvider("linkedin");
    providerRegistry.register("social-post", provider);

    const confirmation = await tool.handler(
      { action: "publish", entityType: "social-post", id: "draft-post" },
      createMockToolContext(),
    );

    expect(confirmation).toHaveProperty("needsConfirmation", true);
    if (!("needsConfirmation" in confirmation)) {
      throw new Error("Expected publish confirmation");
    }
    expect(confirmation.toolName).toBe("publishing_manage");
    expect(confirmation.args).toHaveProperty("action", "publish");
    expect(confirmation.args).toHaveProperty("confirmed", true);

    const result = await tool.handler(
      confirmation.args,
      createMockToolContext(),
    );
    if ("needsConfirmation" in result) {
      throw new Error("Expected publish result");
    }
    expect(result.success).toBe(true);
    expect(provider.publish).toHaveBeenCalledTimes(1);
  });
});
