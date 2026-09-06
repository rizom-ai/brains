import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  type MockShell,
} from "@brains/plugins/test";
import type { OperatorCaller } from "@brains/plugins";
import { PublicationQueueService } from "../src/publication-queue-service";
import { ProviderRegistry } from "../src/provider-registry";
import { PublishExecutor } from "../src/publish-executor";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";
import {
  publishingWorkspace,
  publishingWorkspaceHandlers,
  type PublishingWorkspaceHandlers,
} from "../src/lib/studio-workspace";
import { FixtureAdapter } from "./helpers/fixture-adapter";
import { runtimeFor } from "./helpers/install";

const adminCaller: OperatorCaller = {
  actor: { id: "user:admin" },
  permission: "admin",
  isAnchor: true,
};
const trustedCaller: OperatorCaller = {
  actor: { id: "user:trusted" },
  permission: "trusted",
  isAnchor: false,
};

interface Desk {
  readonly handlers: PublishingWorkspaceHandlers;
  readonly shell: MockShell;
  readonly queue: QueueManager;
  readonly queueService: PublicationQueueService;
}

/**
 * The Publishing desk over one brain's records.
 *
 * The runtime registers the workspace and runs its confirmation flow; what
 * belongs here is what the desk shows and what its buttons do.
 */
async function desk(
  entities: ReadonlyArray<{
    id: string;
    status: string;
    visibility?: "public" | "shared" | "restricted";
  }>,
  options: {
    queued?: readonly string[];
    narrowPermissions?: (shell: MockShell) => void;
  } = {},
): Promise<Desk> {
  const shell = createMockShell();
  options.narrowPermissions?.(shell);
  const runtime = runtimeFor(shell, { delegated: ["social-post"] });
  shell
    .getEntityRegistry()
    .registerEntityType("social-post", baseEntitySchema, new FixtureAdapter());
  for (const entity of entities) {
    await shell.getEntityService().createEntity({
      entity: {
        id: entity.id,
        entityType: "social-post",
        content: entity.id,
        visibility: entity.visibility ?? "public",
        metadata: { status: entity.status, title: entity.id },
      },
    });
  }

  const providerRegistry = ProviderRegistry.createFresh();
  providerRegistry.register("social-post", {
    name: "linkedin",
    publish: async () => ({ id: "remote-post" }),
  });
  const queue = QueueManager.createFresh();
  for (const id of options.queued ?? []) await queue.add("social-post", id);
  const queueService = new PublicationQueueService(runtime, queue);

  return {
    shell,
    queue,
    queueService,
    handlers: publishingWorkspaceHandlers(runtime, {
      providerRegistry,
      queueManager: queue,
      publicationQueueService: queueService,
      retryTracker: RetryTracker.createFresh(),
      publishExecutor: new PublishExecutor({ runtime, providerRegistry }),
    }),
  };
}

function statusOf(shell: MockShell, id: string): Promise<unknown> {
  return shell
    .getEntityService()
    .getEntity({ entityType: "social-post", id })
    .then((entity) => entity?.metadata["status"]);
}

describe("content-pipeline Studio workspace", () => {
  it("declares the Publishing desk and its actions", () => {
    expect(publishingWorkspace).toMatchObject({
      id: "publishing",
      label: "Publishing",
      priority: 40,
      permission: "trusted",
    });
    expect(publishingWorkspace.actions.map((action) => action.name)).toEqual([
      "queue",
      "remove",
      "retry",
      "reorder",
      "publish",
    ]);
  });

  it("opens on the canonical snapshot, scoped to what the caller may act on", async () => {
    const { handlers } = await desk([{ id: "queued-post", status: "queued" }], {
      queued: ["queued-post"],
    });

    expect(handlers.authorize({ caller: adminCaller })).toBe(true);
    expect(handlers.authorize({ caller: null })).toBe(false);
    expect(handlers.listEntityTypes({ caller: adminCaller })).toEqual([
      "social-post",
    ]);

    const data = await handlers.load({ caller: adminCaller });
    const view = publishingWorkspace.view({ data });
    expect(view).toMatchObject({ title: "Publishing desk" });
    const serialized = JSON.stringify(view);
    expect(serialized).toContain("queued-post");
  });

  it("owns validated queue, reorder, remove, and retry actions", async () => {
    const { handlers, shell, queue, queueService } = await desk([
      { id: "first", status: "draft" },
      { id: "second", status: "draft" },
      { id: "failed", status: "failed" },
      { id: "failed-for-queue", status: "failed" },
    ]);
    const target = (
      entityId: string,
    ): { entityType: string; entityId: string } => ({
      entityType: "social-post",
      entityId,
    });

    await handlers.queue({ caller: adminCaller, input: target("first") });
    await handlers.queue({ caller: adminCaller, input: target("second") });
    await handlers.reorder({
      caller: adminCaller,
      input: { ...target("second"), position: 1 },
    });
    expect(
      (await queue.list("social-post")).map((item) => item.entityId),
    ).toEqual(["second", "first"]);

    await handlers.remove({ caller: adminCaller, input: target("first") });
    expect(await statusOf(shell, "first")).toBe("draft");

    expect(
      handlers.queue({
        caller: adminCaller,
        input: target("failed-for-queue"),
      }),
    ).rejects.toThrow("Only draft entities can be queued");

    await handlers.retry({ caller: adminCaller, input: target("failed") });
    expect(await statusOf(shell, "failed")).toBe("queued");
    expect(await queueService.listStored("social-post")).toHaveLength(2);
  });

  it("scopes Trusted workspace data and separates arrange from publish", async () => {
    const { handlers, queue } = await desk(
      [
        { id: "shared-queued", status: "queued", visibility: "shared" },
        { id: "restricted-queued", status: "queued", visibility: "restricted" },
        { id: "shared-draft", status: "draft", visibility: "shared" },
      ],
      {
        queued: ["restricted-queued", "shared-queued"],
        // Arranging the queue is an update; sending it out is a publish, and
        // only an admin may do the second.
        narrowPermissions: (mockShell) => {
          const permissions = mockShell.getPermissionService();
          const original =
            permissions.assertEntityActionAllowed.bind(permissions);
          permissions.assertEntityActionAllowed = (
            entityType,
            action,
            level,
          ): void => {
            if (entityType === "social-post" && level === "trusted") {
              if (action === "update") return;
              if (action === "publish") {
                throw new Error(
                  "publish social-post requires admin permission",
                );
              }
            }
            original(entityType, action, level);
          };
          // getPermissionService builds a fresh object per call, so the
          // narrowed one only survives if the instance is pinned.
          mockShell.getPermissionService = (): typeof permissions =>
            permissions;
        },
      },
    );

    expect(handlers.authorize({ caller: trustedCaller })).toBe(true);
    const data = await handlers.load({ caller: trustedCaller });
    const serialized = JSON.stringify(publishingWorkspace.view({ data }));
    expect(serialized).toContain("shared-queued");
    expect(serialized).not.toContain("restricted-queued");

    expect(
      await handlers.reorder({
        caller: trustedCaller,
        input: {
          entityType: "social-post",
          entityId: "shared-queued",
          position: 1,
        },
      }),
    ).toEqual({ success: true });
    // View position 1 is the caller's own (and only) slot — the hidden
    // restricted entry must keep absolute priority.
    expect(
      (await queue.list("social-post")).map((entry) => entry.entityId),
    ).toEqual(["restricted-queued", "shared-queued"]);

    expect(
      handlers.queue({
        caller: trustedCaller,
        input: { entityType: "social-post", entityId: "shared-draft" },
      }),
    ).rejects.toThrow("requires admin permission");
  });

  it("prepares a publish against the content it read, and publishes once", async () => {
    const { handlers, shell } = await desk([
      { id: "draft-post", status: "draft" },
    ]);
    const input = { entityType: "social-post", entityId: "draft-post" };

    const prepared = await handlers.preparePublish({
      caller: adminCaller,
      input,
    });
    expect(prepared.summary).toContain("draft-post");

    // The revision is the content hash the runtime compares a confirmation
    // against: changing the entity must change it, or a stale approval would
    // publish something nobody read.
    const entity = await shell
      .getEntityService()
      .getEntity({ entityType: "social-post", id: "draft-post" });
    if (!entity) throw new Error("Expected entity");
    await shell.getEntityService().updateEntity({
      entity: { ...entity, content: "Changed after confirmation" },
    });
    const second = await handlers.preparePublish({
      caller: adminCaller,
      input,
    });
    expect(second.revision).not.toBe(prepared.revision);

    const published = await handlers.publish({ caller: adminCaller, input });
    expect(published).toMatchObject({ success: true });
    expect(await statusOf(shell, "draft-post")).toBe("published");
  });
});
