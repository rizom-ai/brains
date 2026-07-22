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
import { PublicationQueueService } from "../src/publication-queue-service";
import { PublishExecutor } from "../src/publish-executor";
import { registerCmsWorkspace } from "../src/lib/cms-workspace";

describe("content-pipeline CMS workspace registration", () => {
  it("is a no-op when the CMS is absent", async () => {
    const context = createServicePluginContext(
      createMockShell(),
      "content-pipeline",
    );

    const queueManager = QueueManager.createFresh();
    const providerRegistry = ProviderRegistry.createFresh();
    const href = await registerCmsWorkspace(context, "content-pipeline", {
      providerRegistry,
      queueManager,
      publicationQueueService: new PublicationQueueService(
        context,
        queueManager,
      ),
      retryTracker: RetryTracker.createFresh(),
      publishExecutor: new PublishExecutor({ context, providerRegistry }),
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
        data: { workspaceUrl: "/cms/workspaces/publishing" },
      };
    });

    const href = await registerCmsWorkspace(context, "content-pipeline", {
      providerRegistry: providers,
      queueManager: queue,
      publicationQueueService: new PublicationQueueService(context, queue),
      retryTracker: RetryTracker.createFresh(),
      publishExecutor: new PublishExecutor({
        context,
        providerRegistry: providers,
      }),
    });

    expect(href).toBe("/cms/workspaces/publishing");
    expect(registration).toMatchObject({
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      priority: 40,
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

  it("owns validated queue, reorder, remove, and retry actions", async () => {
    const shell = createMockShell();
    const context = createServicePluginContext(shell, "content-pipeline");
    context.entities.register("social-post", baseEntitySchema, {} as never);
    for (const [id, status] of [
      ["first", "draft"],
      ["second", "draft"],
      ["failed", "failed"],
      ["failed-for-queue", "failed"],
    ] as const) {
      await context.entityService.createEntity({
        entity: {
          id,
          entityType: "social-post",
          content: id,
          visibility: "public",
          metadata: { status, title: id },
        },
      });
    }

    const providers = ProviderRegistry.createFresh();
    providers.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    const queue = QueueManager.createFresh();
    const queueService = new PublicationQueueService(context, queue);
    let registration: CmsWorkspaceRegistration | undefined;
    context.messaging.subscribe<
      CmsWorkspaceRegistration,
      { workspaceUrl: string }
    >("cms:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/cms/workspaces/publishing" },
      };
    });
    await registerCmsWorkspace(context, "content-pipeline", {
      providerRegistry: providers,
      queueManager: queue,
      publicationQueueService: queueService,
      retryTracker: RetryTracker.createFresh(),
      publishExecutor: new PublishExecutor({
        context,
        providerRegistry: providers,
      }),
    });
    const act = registration?.actionHandler;
    expect(act).toBeFunction();
    const actor = {
      interfaceType: "cms" as const,
      userId: "operator",
      userPermissionLevel: "anchor" as const,
    };

    await act?.(
      { type: "queue", entityType: "social-post", entityId: "first" },
      actor,
    );
    await act?.(
      { type: "queue", entityType: "social-post", entityId: "second" },
      actor,
    );
    await act?.(
      {
        type: "reorder",
        entityType: "social-post",
        entityId: "second",
        position: 1,
      },
      actor,
    );
    expect(
      (await queue.list("social-post")).map((item) => item.entityId),
    ).toEqual(["second", "first"]);

    await act?.(
      { type: "remove", entityType: "social-post", entityId: "first" },
      actor,
    );
    expect(
      (
        await context.entityService.getEntity({
          entityType: "social-post",
          id: "first",
        })
      )?.metadata["status"],
    ).toBe("draft");

    let invalidTransitionError: unknown;
    try {
      await act?.(
        {
          type: "queue",
          entityType: "social-post",
          entityId: "failed-for-queue",
        },
        actor,
      );
    } catch (error) {
      invalidTransitionError = error;
    }
    expect((invalidTransitionError as Error | undefined)?.message).toContain(
      "Only draft entities can be queued",
    );

    await act?.(
      { type: "retry", entityType: "social-post", entityId: "failed" },
      actor,
    );
    expect(
      (
        await context.entityService.getEntity({
          entityType: "social-post",
          id: "failed",
        })
      )?.metadata["status"],
    ).toBe("queued");
    expect(await queueService.listStored("social-post")).toHaveLength(2);

    let invalidActionError: unknown;
    try {
      await act?.({ type: "launch", entityType: "social-post" }, actor);
    } catch (error) {
      invalidActionError = error;
    }
    expect(invalidActionError).toBeInstanceOf(Error);
    expect((invalidActionError as Error).message).toContain(
      "Invalid publishing workspace action",
    );
  });

  it("reuses confirmed publishing with content-hash protection", async () => {
    const shell = createMockShell();
    const context = createServicePluginContext(shell, "content-pipeline");
    context.entities.register("social-post", baseEntitySchema, {} as never);
    await context.entityService.createEntity({
      entity: {
        id: "draft-post",
        entityType: "social-post",
        content: "Original content",
        visibility: "public",
        metadata: { status: "draft", title: "Draft post" },
      },
    });

    let publishCalls = 0;
    const providers = ProviderRegistry.createFresh();
    providers.register("social-post", {
      name: "linkedin",
      publish: async () => {
        publishCalls += 1;
        return { id: "remote-post" };
      },
    });
    const queue = QueueManager.createFresh();
    const queueService = new PublicationQueueService(context, queue);
    let registration: CmsWorkspaceRegistration | undefined;
    context.messaging.subscribe<
      CmsWorkspaceRegistration,
      { workspaceUrl: string }
    >("cms:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/cms/workspaces/publishing" },
      };
    });
    await registerCmsWorkspace(context, "content-pipeline", {
      providerRegistry: providers,
      queueManager: queue,
      publicationQueueService: queueService,
      retryTracker: RetryTracker.createFresh(),
      publishExecutor: new PublishExecutor({
        context,
        providerRegistry: providers,
      }),
    });
    const actor = {
      interfaceType: "cms" as const,
      userId: "operator",
      userPermissionLevel: "anchor" as const,
    };
    const first = (await registration?.actionHandler?.(
      { type: "publish", entityType: "social-post", entityId: "draft-post" },
      actor,
    )) as { needsConfirmation: true; args: Record<string, unknown> };
    expect(first.needsConfirmation).toBe(true);

    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "draft-post",
    });
    if (!entity) throw new Error("Expected entity");
    await context.entityService.updateEntity({
      entity: { ...entity, content: "Changed after confirmation" },
    });
    const stale = (await registration?.actionHandler?.(
      {
        type: "publish",
        entityType: "social-post",
        entityId: "draft-post",
        confirmation: first.args,
      },
      actor,
    )) as { success: false; error: string };
    expect(stale.success).toBe(false);
    expect(stale.error).toContain("changed after confirmation");
    expect(publishCalls).toBe(0);

    const fresh = (await registration?.actionHandler?.(
      { type: "publish", entityType: "social-post", entityId: "draft-post" },
      actor,
    )) as { needsConfirmation: true; args: Record<string, unknown> };
    const published = (await registration?.actionHandler?.(
      {
        type: "publish",
        entityType: "social-post",
        entityId: "draft-post",
        confirmation: fresh.args,
      },
      actor,
    )) as { success: true };
    expect(published.success).toBe(true);
    expect(publishCalls).toBe(1);
    expect(
      (
        await context.entityService.getEntity({
          entityType: "social-post",
          id: "draft-post",
        })
      )?.metadata["status"],
    ).toBe("published");
  });
});
