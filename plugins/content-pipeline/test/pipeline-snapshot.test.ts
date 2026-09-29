import type { MockShell } from "@brains/plugins/test";
import { PIPELINE_PLUGIN_ID, runtimeFor } from "./helpers/install";
import { describe, expect, it } from "bun:test";
import { BaseEntityAdapter, type BaseEntity } from "@brains/plugins";
import { baseEntitySchema, createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";
import { getPublicationPipelineSnapshot } from "../src/pipeline-snapshot";

class FixtureAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "Publication pipeline snapshot fixture",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: this.entityType, content: markdown };
  }
}

/** An asset generation job this package queued, as the runtime records it. */
async function queueAssetJob(
  shell: MockShell,
  input: { sourceEntityId: string },
): Promise<string> {
  return shell.getJobQueueService().enqueue({
    type: "image:image-render-source",
    data: {
      sourceEntityType: "social-post",
      sourceEntityId: input.sourceEntityId,
      attachmentType: "og-image",
    },
    options: {
      source: PIPELINE_PLUGIN_ID,
      metadata: { operationType: "content_operations" },
    },
  });
}

function registerType(shell: MockShell, entityType: string): void {
  shell
    .getEntityRegistry()
    .registerEntityType(
      entityType,
      baseEntitySchema,
      new FixtureAdapter(entityType),
    );
}

async function addEntity(
  shell: MockShell,
  input: {
    entityType: string;
    id: string;
    status: string;
    title: string;
    error?: string;
    scheduledFor?: string;
    visibility?: "public" | "shared" | "restricted";
  },
): Promise<void> {
  await shell.getEntityService().createEntity({
    entity: {
      id: input.id,
      entityType: input.entityType,
      content: input.title,
      ...(input.visibility ? { visibility: input.visibility } : {}),
      metadata: {
        status: input.status,
        title: input.title,
        ...(input.error ? { error: input.error } : {}),
        ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
      },
    },
  });
}

describe("publication pipeline snapshot", () => {
  it("joins registered provider entities, the queue, failures, and active jobs", async () => {
    const shell = createMockShell();
    const context = runtimeFor(shell);
    registerType(shell, "social-post");
    registerType(shell, "workflow-card");

    await addEntity(shell, {
      entityType: "social-post",
      id: "queued-post",
      status: "queued",
      title: "Queued post",
      scheduledFor: "2026-07-20T09:00:00.000Z",
    });
    await addEntity(shell, {
      entityType: "social-post",
      id: "draft-post",
      status: "draft",
      title: "Draft post",
    });
    await addEntity(shell, {
      entityType: "social-post",
      id: "failed-post",
      status: "failed",
      title: "Failed post",
      error: "Provider rejected sender",
    });
    await addEntity(shell, {
      entityType: "social-post",
      id: "published-post",
      status: "published",
      title: "Published post",
    });
    // This status-bearing type is not registered with the content pipeline.
    await addEntity(shell, {
      entityType: "workflow-card",
      id: "unrelated-draft",
      status: "draft",
      title: "Unrelated draft",
    });

    const providers = ProviderRegistry.createFresh();
    providers.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    const queue = QueueManager.createFresh();
    await queue.add("social-post", "queued-post");
    const retries = RetryTracker.createFresh();
    retries.recordFailure("failed-post", "Transient provider error");
    const generatingJobId = await queueAssetJob(shell, {
      sourceEntityId: "queued-post",
    });

    const snapshot = await getPublicationPipelineSnapshot(
      context,
      providers,
      queue,
      retries,
    );

    expect(snapshot.summary).toEqual({
      draft: 1,
      queued: 1,
      generating: 1,
      failed: 1,
      published: 1,
      needsOperator: 2,
    });
    expect(snapshot.publishableEntityTypes).toEqual(["social-post"]);
    expect(snapshot.queue).toEqual([
      expect.objectContaining({
        entityId: "queued-post",
        entityType: "social-post",
        title: "Queued post",
        position: 1,
        destination: "linkedin",
        scheduledFor: "2026-07-20T09:00:00.000Z",
      }),
    ]);
    expect(snapshot.generating).toEqual([
      {
        id: generatingJobId,
        label: "og-image",
        target: "social-post/queued-post",
        status: "pending",
      },
    ]);
    expect(snapshot.failures).toEqual([
      {
        entityId: "failed-post",
        entityType: "social-post",
        title: "Failed post",
        error: "Provider rejected sender",
        retryCount: 1,
      },
    ]);
  });

  it("keeps each destination contiguous in its executable order", async () => {
    const shell = createMockShell();
    const context = runtimeFor(shell);
    registerType(shell, "newsletter");
    registerType(shell, "post");
    for (const input of [
      { entityType: "post", id: "post-one", title: "Post one" },
      { entityType: "post", id: "post-two", title: "Post two" },
      {
        entityType: "newsletter",
        id: "newsletter-one",
        title: "Newsletter one",
      },
    ]) {
      await addEntity(shell, { ...input, status: "queued" });
    }

    const providers = ProviderRegistry.createFresh();
    providers.register("post", {
      name: "website",
      publish: async () => ({ id: "remote-post" }),
    });
    providers.register("newsletter", {
      name: "buttondown",
      publish: async () => ({ id: "remote-newsletter" }),
    });
    const queue = QueueManager.createFresh();
    queue.replace([
      {
        entityType: "post",
        entityId: "post-one",
        position: 1,
        queuedAt: "2026-07-14T08:00:00.000Z",
        authContext: {},
      },
      {
        entityType: "newsletter",
        entityId: "newsletter-one",
        position: 1,
        queuedAt: "2026-07-14T08:01:00.000Z",
        authContext: {},
      },
      {
        entityType: "post",
        entityId: "post-two",
        position: 2,
        queuedAt: "2026-07-14T08:02:00.000Z",
        authContext: {},
      },
    ]);

    const snapshot = await getPublicationPipelineSnapshot(
      context,
      providers,
      queue,
      RetryTracker.createFresh(),
    );

    expect(
      snapshot.queue.map((item) =>
        [item.entityType, item.entityId, item.position].join(":"),
      ),
    ).toEqual([
      "newsletter:newsletter-one:1",
      "post:post-one:1",
      "post:post-two:2",
    ]);
  });

  it("renumbers scoped queue positions so hidden entries leave no gap", async () => {
    const shell = createMockShell();
    const context = runtimeFor(shell);
    registerType(shell, "social-post");
    await addEntity(shell, {
      entityType: "social-post",
      id: "restricted-first",
      status: "queued",
      title: "Restricted first",
      visibility: "restricted",
    });
    await addEntity(shell, {
      entityType: "social-post",
      id: "shared-second",
      status: "queued",
      title: "Shared second",
      visibility: "shared",
    });

    const providers = ProviderRegistry.createFresh();
    providers.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    const queue = QueueManager.createFresh();
    await queue.add("social-post", "restricted-first");
    await queue.add("social-post", "shared-second");

    const snapshot = await getPublicationPipelineSnapshot(
      context,
      providers,
      queue,
      RetryTracker.createFresh(),
      { visibilityScope: "shared" },
    );

    // A gap (position 2 with no position 1) would reveal that a hidden
    // restricted publication is queued ahead of the caller's.
    expect(
      snapshot.queue.map((item) => [item.entityId, item.position].join(":")),
    ).toEqual(["shared-second:1"]);
  });

  it("keeps orphaned generation jobs visible at full restricted scope", async () => {
    const shell = createMockShell();
    const context = runtimeFor(shell);
    registerType(shell, "social-post");

    const providers = ProviderRegistry.createFresh();
    providers.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    // The job's source entity does not exist (deleted mid-generation).
    const orphanJobId = await queueAssetJob(shell, {
      sourceEntityId: "deleted-post",
    });

    const adminSnapshot = await getPublicationPipelineSnapshot(
      context,
      providers,
      QueueManager.createFresh(),
      RetryTracker.createFresh(),
      { visibilityScope: "restricted" },
    );
    // Restricted scope reads everything — still-running work must not vanish
    // from the operator view just because its source entity is gone.
    expect(adminSnapshot.generating.map((job) => job.id)).toEqual([
      orphanJobId,
    ]);
    expect(adminSnapshot.summary.generating).toBe(1);

    const trustedSnapshot = await getPublicationPipelineSnapshot(
      context,
      providers,
      QueueManager.createFresh(),
      RetryTracker.createFresh(),
      { visibilityScope: "shared" },
    );
    // Narrower scopes fail closed: unverifiable sources stay hidden.
    expect(trustedSnapshot.generating).toEqual([]);
  });

  it("returns an idle snapshot when no publish provider is registered", async () => {
    const shell = createMockShell();
    const context = runtimeFor(shell);
    registerType(shell, "workflow-card");
    await addEntity(shell, {
      entityType: "workflow-card",
      id: "draft",
      status: "draft",
      title: "Not publication content",
    });

    const snapshot = await getPublicationPipelineSnapshot(
      context,
      ProviderRegistry.createFresh(),
      QueueManager.createFresh(),
      RetryTracker.createFresh(),
    );

    expect(snapshot).toEqual({
      summary: {
        draft: 0,
        queued: 0,
        generating: 0,
        failed: 0,
        published: 0,
        needsOperator: 0,
      },
      queue: [],
      generating: [],
      failures: [],
      publishableEntityTypes: [],
    });
  });
});
