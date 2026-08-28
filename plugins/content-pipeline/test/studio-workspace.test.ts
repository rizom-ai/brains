import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import {
  BaseEntityAdapter,
  type BaseEntity,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";
import { PublicationQueueService } from "../src/publication-queue-service";
import { PublishExecutor } from "../src/publish-executor";
import { registerStudioWorkspace } from "../src/lib/studio-workspace";

const fixtureFrontmatterSchema = z.object({});

class FixtureAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "social-post",
      purpose: "Studio workspace fixture",
      schema: baseEntitySchema,
      frontmatterSchema: fixtureFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: this.entityType, content: markdown };
  }
}

const trustedActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "editor",
  actor: { kind: "user", userId: "editor" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

const adminActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "operator",
  actor: { kind: "user", userId: "operator" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

const preparedConfirmationSchema = z.object({
  kind: z.literal("prepared-confirmation"),
  token: z.string().uuid(),
  summary: z.string(),
  expiresAt: z.string().datetime(),
});
const successResultSchema = z.object({ success: z.literal(true) });

describe("content-pipeline Studio workspace registration", () => {
  it("is a no-op when the Studio is absent", async () => {
    const context = createServicePluginContext(
      createMockShell(),
      "content-pipeline",
    );

    const queueManager = QueueManager.createFresh();
    const providerRegistry = ProviderRegistry.createFresh();
    const href = await registerStudioWorkspace(context, {
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

  it("registers the declarative Publishing workspace backed by the canonical snapshot", async () => {
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
    let registration: StudioWorkspaceRegistration | undefined;
    context.messaging.subscribe<
      StudioWorkspaceRegistration,
      { workspaceUrl: string }
    >("studio:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/studio/workspaces/publishing" },
      };
    });

    const href = await registerStudioWorkspace(context, {
      providerRegistry: providers,
      queueManager: queue,
      publicationQueueService: new PublicationQueueService(context, queue),
      retryTracker: RetryTracker.createFresh(),
      publishExecutor: new PublishExecutor({
        context,
        providerRegistry: providers,
      }),
    });

    expect(href).toBe("/studio/workspaces/publishing");
    expect(registration).toMatchObject({
      id: "content-pipeline:publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 40,
    });
    if (!registration) throw new Error("Workspace was not registered");
    // Entity types resolve against the caller so descriptors never disclose
    // types the actor cannot act on.
    expect(
      typeof registration.entityTypes === "function"
        ? await registration.entityTypes(adminActor)
        : registration.entityTypes,
    ).toEqual(["social-post"]);
    expect(await registration.accessHandler(adminActor)).toBe(true);
    const workspace = await registration.dataProvider(adminActor);
    expect(workspace).toMatchObject({
      view: { title: "Publishing desk" },
    });
    expect(JSON.stringify(workspace)).toContain('"title":"Queued post"');
    expect(JSON.stringify(workspace)).toContain('"entityType":"social-post"');
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
    let registration: StudioWorkspaceRegistration | undefined;
    context.messaging.subscribe<
      StudioWorkspaceRegistration,
      { workspaceUrl: string }
    >("studio:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/studio/workspaces/publishing" },
      };
    });
    await registerStudioWorkspace(context, {
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
      {
        actionId: "queue",
        input: { entityType: "social-post", entityId: "first" },
      },
      actor,
    );
    await act?.(
      {
        actionId: "queue",
        input: { entityType: "social-post", entityId: "second" },
      },
      actor,
    );
    await act?.(
      {
        actionId: "reorder",
        input: {
          entityType: "social-post",
          entityId: "second",
          position: 1,
        },
      },
      actor,
    );
    expect(
      (await queue.list("social-post")).map((item) => item.entityId),
    ).toEqual(["second", "first"]);

    await act?.(
      {
        actionId: "remove",
        input: { entityType: "social-post", entityId: "first" },
      },
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
          actionId: "queue",
          input: {
            entityType: "social-post",
            entityId: "failed-for-queue",
          },
        },
        actor,
      );
    } catch (error) {
      invalidTransitionError = error;
    }
    if (!(invalidTransitionError instanceof Error)) {
      throw new Error("Expected invalid transition to fail");
    }
    expect(invalidTransitionError.message).toContain('action "queue" failed');

    await act?.(
      {
        actionId: "retry",
        input: { entityType: "social-post", entityId: "failed" },
      },
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
      await act?.({ actionId: "launch", input: {} }, actor);
    } catch (error) {
      invalidActionError = error;
    }
    if (!(invalidActionError instanceof Error)) {
      throw new Error("Expected invalid action to fail");
    }
    expect(invalidActionError.message).toContain(
      'does not declare action "launch"',
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
    await queue.add("social-post", "restricted-queued");
    await queue.add("social-post", "shared-queued");
    let registration: StudioWorkspaceRegistration | undefined;
    context.messaging.subscribe<
      StudioWorkspaceRegistration,
      { workspaceUrl: string }
    >("studio:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/studio/workspaces/publishing" },
      };
    });
    await registerStudioWorkspace(context, {
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
    const trustedWorkspace = await registration.dataProvider(trustedActor);
    expect(trustedWorkspace).toMatchObject({
      view: { title: "Publishing desk" },
    });
    const trustedSerialized = JSON.stringify(trustedWorkspace);
    expect(trustedSerialized).toContain("shared-queued");
    expect(trustedSerialized).not.toContain("restricted-queued");
    expect(
      await registration.actionHandler(
        {
          actionId: "reorder",
          input: {
            entityType: "social-post",
            entityId: "shared-queued",
            position: 1,
          },
        },
        trustedActor,
      ),
    ).toEqual({ success: true });
    // View position 1 is the caller's own (and only) slot — the hidden
    // restricted entry must keep absolute priority.
    expect(
      (await queue.list("social-post")).map((entry) => entry.entityId),
    ).toEqual(["restricted-queued", "shared-queued"]);
    expect(
      registration.actionHandler(
        {
          actionId: "queue",
          input: {
            entityType: "social-post",
            entityId: "shared-draft",
          },
        },
        trustedActor,
      ),
    ).rejects.toThrow('action "queue" failed');
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
    let registration: StudioWorkspaceRegistration | undefined;
    context.messaging.subscribe<
      StudioWorkspaceRegistration,
      { workspaceUrl: string }
    >("studio:register-workspace", async (message) => {
      registration = message.payload;
      return {
        success: true,
        data: { workspaceUrl: "/studio/workspaces/publishing" },
      };
    });
    await registerStudioWorkspace(context, {
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
    const publishInput = {
      entityType: "social-post",
      entityId: "draft-post",
    };
    const first = preparedConfirmationSchema.parse(
      await registration?.actionHandler?.(
        { actionId: "publish", input: publishInput, mode: "prepare" },
        actor,
      ),
    );
    expect(first.summary).toContain("Draft post");

    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "draft-post",
    });
    if (!entity) throw new Error("Expected entity");
    await context.entityService.updateEntity({
      entity: { ...entity, content: "Changed after confirmation" },
    });
    expect(
      registration?.actionHandler?.(
        {
          actionId: "publish",
          input: publishInput,
          confirmationToken: first.token,
        },
        actor,
      ),
    ).rejects.toThrow("invalid or stale");
    expect(publishCalls).toBe(0);

    const fresh = preparedConfirmationSchema.parse(
      await registration?.actionHandler?.(
        { actionId: "publish", input: publishInput, mode: "prepare" },
        actor,
      ),
    );
    const published = successResultSchema.parse(
      await registration?.actionHandler?.(
        {
          actionId: "publish",
          input: publishInput,
          confirmationToken: fresh.token,
        },
        actor,
      ),
    );
    expect(published.success).toBe(true);
    expect(publishCalls).toBe(1);
    expect(
      registration?.actionHandler?.(
        {
          actionId: "publish",
          input: publishInput,
          confirmationToken: fresh.token,
        },
        actor,
      ),
    ).rejects.toThrow("invalid or stale");
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
