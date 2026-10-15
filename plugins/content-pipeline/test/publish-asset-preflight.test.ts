import {
  createMockServicePluginContext,
  refuseEnqueues,
} from "@brains/plugins/test";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { isRecord } from "@brains/utils/is-record";
import { RetryScope } from "@brains/utils/retry-backoff";
import { describe, expect, it, type mock } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { PublishAssetPreflight } from "../src/publish-asset-preflight";
import { PublishAssetRegistry } from "../src/publish-assets";

function createPublishedPost(overrides: Partial<BaseEntity> = {}): BaseEntity {
  return {
    id: "post-1",
    entityType: "post",
    content: `---
title: Test Post
status: published
---
Body`,
    visibility: "public",
    metadata: { status: "published", slug: "post-1" },
    created: "2026-06-04T12:00:00.000Z",
    updated: "2026-06-04T12:00:00.000Z",
    contentHash: "hash",
    ...overrides,
  };
}

function createPreflight(
  options: {
    hasProvider?: boolean;
    current?: BaseEntity | null;
    retries?: RetryScope;
  } = {},
): {
  preflight: PublishAssetPreflight;
  enqueue: ReturnType<typeof mock>;
  context: ReturnType<typeof createMockServicePluginContext>;
} {
  const registry = PublishAssetRegistry.createFresh();
  registry.register({
    entityType: "post",
    attachmentType: "og-image",
    mediaEntityType: "image",
    targetEntityField: { location: "frontmatter", field: "ogImageId" },
    requiredWhen: { status: "published" },
    autoGenerate: true,
    jobType: "image:image-render-source",
  });

  // The factory's namespaces are real and spied, so the preflight runs against
  // the actual attachments and jobs implementations.
  const context = createMockServicePluginContext({
    returns: {
      jobsEnqueue: "job-1",
      entityService: { getEntity: options.current ?? null },
    },
  });
  context.attachments.hasProvider.mockImplementation(
    () => options.hasProvider ?? true,
  );

  return {
    preflight: new PublishAssetPreflight({
      context,
      registry,
      ...(options.retries ? { retries: options.retries } : {}),
    }),
    enqueue: context.jobs.enqueue,
    context,
  };
}

describe("PublishAssetPreflight", () => {
  it("enqueues missing published assets", async () => {
    const { preflight, enqueue } = createPreflight();

    const result = await preflight.ensureForEntity(createPublishedPost());

    expect(result).toEqual({ checked: 1, enqueued: 1, skipped: 0 });
    expect(enqueue).toHaveBeenCalledWith({
      type: "image:image-render-source",
      data: {
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        attachmentType: "og-image",
        imageId: "og-post-post-1",
        dedupKey: "publish-asset:og-image:post:post-1",
        targetEntityType: "post",
        targetEntityId: "post-1",
        targetImageField: "ogImageId",
      },
      options: {
        source: "content-pipeline",
        metadata: {
          operationType: "content_operations",
        },
        deduplication: "skip",
        deduplicationKey: "publish-asset:og-image:post:post-1",
      },
    });
  });

  it("skips drafts", async () => {
    const { preflight, enqueue } = createPreflight();

    const result = await preflight.ensureForEntity(
      createPublishedPost({ metadata: { status: "draft" } }),
    );

    expect(result).toEqual({ checked: 1, enqueued: 0, skipped: 1 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("skips when target field already exists", async () => {
    const { preflight, enqueue } = createPreflight();

    const result = await preflight.ensureForEntity(
      createPublishedPost({
        content: `---
title: Test Post
status: published
ogImageId: existing-og
---
Body`,
      }),
    );

    expect(result).toEqual({ checked: 1, enqueued: 0, skipped: 1 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("skips when no attachment provider exists", async () => {
    const { preflight, enqueue } = createPreflight({ hasProvider: false });

    const result = await preflight.ensureForEntity(createPublishedPost());

    expect(result).toEqual({ checked: 1, enqueued: 0, skipped: 1 });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

/** Calls recorded on a spy whose generic signature hides its mock type. */
function mockCalls(fn: unknown): number {
  if (typeof fn !== "function" || !("mock" in fn)) return 0;
  const recorded: unknown = fn.mock;
  return isRecord(recorded) && Array.isArray(recorded["calls"])
    ? recorded["calls"].length
    : 0;
}

describe("PublishAssetPreflight refused enqueues", () => {
  function retryScope(): RetryScope {
    return new RetryScope({ firstDelayMs: 10, logger: createSilentLogger() });
  }

  it("queues an asset the queue refused once it admits it", async () => {
    const retries = retryScope();
    const post = createPublishedPost();
    const { preflight, enqueue, context } = createPreflight({
      current: post,
      retries,
    });
    const refusals = refuseEnqueues(context.jobs, 1);

    await preflight.ensureOrRetry(post);
    expect(refusals.count).toBe(1);

    await waitUntil(
      () => enqueue.mock.calls.length === 1,
      "the refused asset to be queued",
    );
    await retries.dispose();
  });

  it("re-reads the entity, queuing nothing once its asset exists", async () => {
    const retries = retryScope();
    const { preflight, enqueue, context } = createPreflight({
      current: createPublishedPost({
        content: `---
title: Test Post
status: published
ogImageId: existing-og
---
Body`,
      }),
      retries,
    });
    const refusals = refuseEnqueues(context.jobs, 1);

    await preflight.ensureOrRetry(createPublishedPost());
    await waitUntil(
      () =>
        mockCalls(context.entityService.getEntity) > 0 && refusals.count === 1,
      "the retry to re-read the entity",
    );
    await retries.dispose();

    expect(enqueue).not.toHaveBeenCalled();
  });
});
