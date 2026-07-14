import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import type { CmsWorkspaceRegistration } from "@brains/plugins";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";
import { registerCmsWorkspace } from "../src/lib/cms-workspace";

describe("content-pipeline CMS workspace registration", () => {
  it("is a no-op when the CMS is absent", async () => {
    const context = createServicePluginContext(
      createMockShell(),
      "content-pipeline",
    );

    const href = await registerCmsWorkspace(context, "content-pipeline", {
      providerRegistry: ProviderRegistry.createFresh(),
      queueManager: QueueManager.createFresh(),
      retryTracker: RetryTracker.createFresh(),
    });

    expect(href).toBeUndefined();
  });

  it("registers the Publishing renderer backed by the canonical snapshot", async () => {
    const shell = createMockShell();
    const context = createServicePluginContext(shell, "content-pipeline");
    context.entities.register("social-post", baseEntitySchema, {} as never);
    await context.entityService.createEntity({
      entity: {
        id: "queued-post",
        entityType: "social-post",
        content: "Queued post",
        metadata: { status: "queued", title: "Queued post" },
      },
    });

    const providers = ProviderRegistry.createFresh();
    providers.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    const queue = QueueManager.createFresh();
    await queue.add("social-post", "queued-post");
    let registration: CmsWorkspaceRegistration | undefined;
    context.messaging.subscribe<
      CmsWorkspaceRegistration,
      { workspaceUrl: string }
    >("cms:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/cms#/workspace/publishing" },
      };
    });

    const href = await registerCmsWorkspace(context, "content-pipeline", {
      providerRegistry: providers,
      queueManager: queue,
      retryTracker: RetryTracker.createFresh(),
    });

    expect(href).toBe("/cms#/workspace/publishing");
    expect(registration).toMatchObject({
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      entityTypes: ["social-post"],
    });
    expect(await registration?.dataProvider()).toMatchObject({
      summary: { queued: 1 },
      queue: [
        expect.objectContaining({
          entityId: "queued-post",
          destination: "linkedin",
        }),
      ],
    });
  });
});
