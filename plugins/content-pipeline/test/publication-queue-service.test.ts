import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import { QueueManager } from "../src/queue-manager";
import { PublicationQueueService } from "../src/publication-queue-service";

async function createFixture(): Promise<{
  context: ReturnType<typeof createServicePluginContext>;
  queueManager: QueueManager;
  service: PublicationQueueService;
}> {
  const context = createServicePluginContext(
    createMockShell(),
    "content-pipeline",
  );
  context.entities.register("social-post", baseEntitySchema, {} as never);
  for (const [id, title] of [
    ["first", "First post"],
    ["second", "Second post"],
    ["third", "Third post"],
  ] as const) {
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: "social-post",
        content: `---\ntitle: ${title}\nstatus: draft\n---\n\nBody`,
        metadata: { title, status: "draft" },
      },
    });
  }
  const queueManager = QueueManager.createFresh();
  return {
    context,
    queueManager,
    service: new PublicationQueueService(context, queueManager),
  };
}

describe("PublicationQueueService", () => {
  it("persists queue intent on the entity and operational order in runtime state", async () => {
    const { context, queueManager, service } = await createFixture();

    const result = await service.enqueue("social-post", "first", {
      interfaceType: "cms",
      actor: { kind: "user", userId: "operator" },
      userPermissionLevel: "anchor",
      authorization: "user",
    });

    expect(result.position).toBe(1);
    expect(await queueManager.list("social-post")).toEqual([
      expect.objectContaining({
        entityId: "first",
        entityType: "social-post",
        position: 1,
      }),
    ]);
    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "first",
    });
    expect(entity?.metadata).toMatchObject({ status: "queued" });
    expect(entity?.metadata).not.toHaveProperty("queueOrder");
    expect(entity?.content).toContain("status: queued");
    expect(await service.listStored()).toEqual([
      expect.objectContaining({
        entityType: "social-post",
        entityId: "first",
        rank: 1024,
        revision: 1,
        contentHashAtEnqueue: expect.any(String),
        authContext: expect.objectContaining({
          interfaceType: "cms",
          actor: { kind: "user", userId: "operator" },
          authorization: "user",
        }),
      }),
    ]);
  });

  it("reorders runtime records without rewriting entity content", async () => {
    const { context, queueManager, service } = await createFixture();
    await service.enqueue("social-post", "first");
    await service.enqueue("social-post", "second");
    await service.enqueue("social-post", "third");
    const before = await context.entityService.getEntity({
      entityType: "social-post",
      id: "third",
    });

    await service.reorder("social-post", "third", 1);

    expect(
      (await queueManager.list("social-post")).map((entry) => entry.entityId),
    ).toEqual(["third", "first", "second"]);
    expect(
      (await service.listStored("social-post")).map((entry) => ({
        id: entry.entityId,
        rank: entry.rank,
      })),
    ).toEqual([
      { id: "third", rank: 1024 },
      { id: "first", rank: 2048 },
      { id: "second", rank: 3072 },
    ]);
    const after = await context.entityService.getEntity({
      entityType: "social-post",
      id: "third",
    });
    expect(after?.content).toBe(before?.content);
    expect(after?.contentHash).toBe(before?.contentHash);
  });

  it("removes queue intent and its runtime record", async () => {
    const { context, queueManager, service } = await createFixture();
    await service.enqueue("social-post", "first");
    await service.enqueue("social-post", "second");

    await service.remove("social-post", "first");

    expect(
      (await queueManager.list("social-post")).map((entry) => entry.entityId),
    ).toEqual(["second"]);
    expect(await service.listStored("social-post")).toEqual([
      expect.objectContaining({ entityId: "second", rank: 1024 }),
    ]);
    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "first",
    });
    expect(entity?.metadata).toMatchObject({ status: "draft" });
    expect(entity?.content).toContain("status: draft");
  });

  it("cleans operational state after successful publication", async () => {
    const { context, queueManager, service } = await createFixture();
    await service.enqueue("social-post", "first");
    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "first",
    });
    if (!entity) throw new Error("fixture entity missing");
    await context.entityService.updateEntity({
      entity: {
        ...entity,
        metadata: { ...entity.metadata, status: "published" },
        content: entity.content.replace("status: queued", "status: published"),
      },
    });

    await service.complete("social-post", "first");

    expect(await service.listStored("social-post")).toEqual([]);
    expect(await queueManager.list("social-post")).toEqual([]);
  });

  it("persists failed publication state before dropping operational order", async () => {
    const { context, queueManager, service } = await createFixture();
    await service.enqueue("social-post", "first");

    await service.fail("social-post", "first", "Provider unavailable");

    expect(await service.listStored("social-post")).toEqual([]);
    expect(await queueManager.list("social-post")).toEqual([]);
    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "first",
    });
    expect(entity?.metadata).toMatchObject({
      status: "failed",
      error: "Provider unavailable",
    });
    expect(entity?.content).toContain("status: failed");
  });

  it("reconciles a fresh in-memory queue from entities and runtime ordering", async () => {
    const { context, service } = await createFixture();
    await service.enqueue("social-post", "first");
    await service.enqueue("social-post", "second");
    await service.reorder("social-post", "second", 1);
    const storedBeforeRestart = await service.listStored("social-post");

    const restoredManager = QueueManager.createFresh();
    const restored = new PublicationQueueService(context, restoredManager);
    await restored.reconcile(["social-post"]);

    expect(
      (await restoredManager.list("social-post")).map((entry) => ({
        id: entry.entityId,
        queuedAt: entry.queuedAt,
      })),
    ).toEqual(
      storedBeforeRestart.map((entry) => ({
        id: entry.entityId,
        queuedAt: entry.queuedAt,
      })),
    );
  });

  it("repairs missing and orphaned runtime records from entity intent", async () => {
    const { context, queueManager, service } = await createFixture();
    await service.enqueue("social-post", "first");
    await service.enqueue("social-post", "second");

    // Simulate recoverable runtime-state loss for one queued entity.
    await service.deleteStored("social-post", "second");
    // Simulate an entity transition committed before stale queue cleanup.
    const first = await context.entityService.getEntity({
      entityType: "social-post",
      id: "first",
    });
    if (!first) throw new Error("fixture entity missing");
    await context.entityService.updateEntity({
      entity: {
        ...first,
        metadata: { ...first.metadata, status: "draft" },
        content: first.content.replace("status: queued", "status: draft"),
      },
    });

    await service.reconcile(["social-post"]);

    expect(
      (await queueManager.list("social-post")).map((entry) => entry.entityId),
    ).toEqual(["second"]);
    expect(await service.listStored("social-post")).toEqual([
      expect.objectContaining({ entityId: "second", rank: 1024 }),
    ]);
  });
});
