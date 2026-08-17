import { describe, expect, it, type mock } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { createMockServicePluginContext } from "@brains/test-utils";
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

function createPreflight(options: { hasProvider?: boolean } = {}): {
  preflight: PublishAssetPreflight;
  enqueue: ReturnType<typeof mock>;
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
    returns: { jobsEnqueue: "job-1" },
  });
  context.attachments.hasProvider.mockImplementation(
    () => options.hasProvider ?? true,
  );

  return {
    preflight: new PublishAssetPreflight({ context, registry }),
    enqueue: context.jobs.enqueue,
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
