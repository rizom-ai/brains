import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";
import { getPublicationPipelineSnapshot } from "../src/pipeline-snapshot";

function registerType(context: ServicePluginContext, entityType: string): void {
  context.entities.register(entityType, baseEntitySchema, {} as never);
}

async function addEntity(
  context: ServicePluginContext,
  input: {
    entityType: string;
    id: string;
    status: string;
    title: string;
    error?: string;
    scheduledFor?: string;
  },
): Promise<void> {
  await context.entityService.createEntity({
    entity: {
      id: input.id,
      entityType: input.entityType,
      content: input.title,
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
    const context = createServicePluginContext(shell, "content-pipeline");
    registerType(context, "social-post");
    registerType(context, "workflow-card");

    await addEntity(context, {
      entityType: "social-post",
      id: "queued-post",
      status: "queued",
      title: "Queued post",
      scheduledFor: "2026-07-20T09:00:00.000Z",
    });
    await addEntity(context, {
      entityType: "social-post",
      id: "draft-post",
      status: "draft",
      title: "Draft post",
    });
    await addEntity(context, {
      entityType: "social-post",
      id: "failed-post",
      status: "failed",
      title: "Failed post",
      error: "Provider rejected sender",
    });
    await addEntity(context, {
      entityType: "social-post",
      id: "published-post",
      status: "published",
      title: "Published post",
    });
    // This status-bearing type is not registered with the content pipeline.
    await addEntity(context, {
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
    type ActiveJobs = Awaited<
      ReturnType<ServicePluginContext["jobs"]["getActiveJobs"]>
    >;
    context.jobs.getActiveJobs = async (): Promise<ActiveJobs> => [
      {
        id: "job-1",
        type: "image:image-render-source",
        data: JSON.stringify({
          sourceEntityType: "social-post",
          sourceEntityId: "queued-post",
          attachmentType: "og-image",
        }),
        status: "processing" as const,
        source: "content-pipeline",
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        lastError: null,
        createdAt: 0,
        scheduledFor: 0,
        startedAt: null,
        completedAt: null,
        metadata: {} as never,
      },
    ];

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
        id: "job-1",
        label: "og-image",
        target: "social-post/queued-post",
        status: "processing",
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

  it("returns an idle snapshot when no publish provider is registered", async () => {
    const shell = createMockShell();
    const context = createServicePluginContext(shell, "content-pipeline");
    registerType(context, "workflow-card");
    await addEntity(context, {
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
