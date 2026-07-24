import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import {
  BaseEntityAdapter,
  type BaseEntity,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";
import { PublicationQueueService } from "../src/publication-queue-service";
import { PublishExecutor } from "../src/publish-executor";
import { registerCmsWorkspace } from "../src/lib/cms-workspace";

const fixtureFrontmatterSchema = z.object({});

class FixtureAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "social-post",
      purpose: "CMS workspace fixture",
      schema: baseEntitySchema,
      frontmatterSchema: fixtureFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: this.entityType, content: markdown };
  }
}

const trustedActor: CmsWorkspaceActor = {
  interfaceType: "cms",
  userId: "editor",
  actor: { kind: "user", userId: "editor" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

const adminActor: CmsWorkspaceActor = {
  interfaceType: "cms",
  userId: "operator",
  actor: { kind: "user", userId: "operator" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

const confirmationResultSchema = z.object({
  needsConfirmation: z.literal(true),
  args: z.object({
    confirmed: z.literal(true),
    confirmationToken: z.string(),
    contentHash: z.string(),
    expiresAt: z.string(),
  }),
});
const failedResultSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});
const successResultSchema = z.object({ success: z.literal(true) });

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
    context.entities.register(
      "social-post",
      baseEntitySchema,
      new FixtureAdapter(),
    );
    await context.entityService.createEntity({
      entity: {
        id: "queued-post",
        entityType: "social-post",
        content: "Queued post",
        metadata: { status: "queued", title: "Queued post" },
        visibility: "public",
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
    if (!registration) throw new Error("Workspace was not registered");
    expect(await registration.accessHandler(adminActor)).toBe(true);
    expect(await registration.dataProvider(adminActor)).toMatchObject({
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
    context.entities.register(
      "social-post",
      baseEntitySchema,
      new FixtureAdapter(),
    );
    const fixtureEntities: Array<readonly [string, "draft" | "failed"]> = [
      ["first", "draft"],
      ["second", "draft"],
      ["failed", "failed"],
      ["failed-for-queue", "failed"],
    ];
    for (const [id, status] of fixtureEntities) {
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
    const actor = adminActor;

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
    if (!(invalidTransitionError instanceof Error)) {
      throw new Error("Expected invalid transition to fail");
    }
    expect(invalidTransitionError.message).toContain(
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
    if (!(invalidActionError instanceof Error)) {
      throw new Error("Expected invalid action to fail");
    }
    expect(invalidActionError.message).toContain(
      "Invalid publishing workspace action",
    );
  });

  it("scopes Trusted workspace data and separates arrange from publish", async () => {
    const shell = createMockShell();
    const permissionService = shell.getPermissionService();
    const originalAssert =
      permissionService.assertEntityActionAllowed.bind(permissionService);
    permissionService.assertEntityActionAllowed = (
      entityType,
      action,
      userPermissionLevel,
    ): void => {
      if (entityType === "social-post" && userPermissionLevel === "trusted") {
        if (action === "update") return;
        if (action === "publish") {
          throw new Error("publish social-post requires admin permission");
        }
      }
      originalAssert(entityType, action, userPermissionLevel);
    };
    shell.getPermissionService = (): typeof permissionService =>
      permissionService;
    const context = createServicePluginContext(shell, "content-pipeline");
    context.entities.register(
      "social-post",
      baseEntitySchema,
      new FixtureAdapter(),
    );
    const scopedEntities: Array<{
      id: string;
      visibility: "shared" | "restricted";
      status: "draft" | "queued";
    }> = [
      {
        id: "shared-queued",
        visibility: "shared",
        status: "queued",
      },
      {
        id: "restricted-queued",
        visibility: "restricted",
        status: "queued",
      },
      { id: "shared-draft", visibility: "shared", status: "draft" },
    ];
    for (const entity of scopedEntities) {
      await context.entityService.createEntity({
        entity: {
          id: entity.id,
          entityType: "social-post",
          content: entity.id,
          visibility: entity.visibility,
          metadata: { status: entity.status, title: entity.id },
        },
      });
    }

    const providers = ProviderRegistry.createFresh();
    providers.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    const queue = QueueManager.createFresh();
    await queue.add("social-post", "shared-queued");
    await queue.add("social-post", "restricted-queued");
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
      publicationQueueService: new PublicationQueueService(context, queue),
      retryTracker: RetryTracker.createFresh(),
      publishExecutor: new PublishExecutor({
        context,
        providerRegistry: providers,
      }),
    });
    if (!registration?.actionHandler) {
      throw new Error("Workspace was not registered");
    }

    expect(
      await Promise.resolve(registration.accessHandler(trustedActor)),
    ).toBe(true);
    expect(await registration.dataProvider(trustedActor)).toMatchObject({
      summary: { draft: 1, queued: 1 },
      queue: [{ entityId: "shared-queued" }],
    });
    expect(
      await registration.actionHandler(
        {
          type: "reorder",
          entityType: "social-post",
          entityId: "shared-queued",
          position: 1,
        },
        trustedActor,
      ),
    ).toEqual({ success: true });
    expect(
      registration.actionHandler(
        {
          type: "queue",
          entityType: "social-post",
          entityId: "shared-draft",
        },
        trustedActor,
      ),
    ).rejects.toThrow();
  });

  it("reuses confirmed publishing with content-hash protection", async () => {
    const shell = createMockShell();
    const context = createServicePluginContext(shell, "content-pipeline");
    context.entities.register(
      "social-post",
      baseEntitySchema,
      new FixtureAdapter(),
    );
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
    const actor = adminActor;
    const first = confirmationResultSchema.parse(
      await registration?.actionHandler?.(
        {
          type: "publish",
          entityType: "social-post",
          entityId: "draft-post",
        },
        actor,
      ),
    );
    expect(first.needsConfirmation).toBe(true);

    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "draft-post",
    });
    if (!entity) throw new Error("Expected entity");
    await context.entityService.updateEntity({
      entity: { ...entity, content: "Changed after confirmation" },
    });
    const stale = failedResultSchema.parse(
      await registration?.actionHandler?.(
        {
          type: "publish",
          entityType: "social-post",
          entityId: "draft-post",
          confirmation: first.args,
        },
        actor,
      ),
    );
    expect(stale.success).toBe(false);
    expect(stale.error).toContain("changed after confirmation");
    expect(publishCalls).toBe(0);

    const fresh = confirmationResultSchema.parse(
      await registration?.actionHandler?.(
        {
          type: "publish",
          entityType: "social-post",
          entityId: "draft-post",
        },
        actor,
      ),
    );
    const published = successResultSchema.parse(
      await registration?.actionHandler?.(
        {
          type: "publish",
          entityType: "social-post",
          entityId: "draft-post",
          confirmation: fresh.args,
        },
        actor,
      ),
    );
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
