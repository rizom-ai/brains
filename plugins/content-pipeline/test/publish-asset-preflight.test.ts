import { describe, expect, it, mock } from "bun:test";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
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

  const enqueue = mock(async () => "job-1");
  const context = {
    attachments: {
      hasProvider: mock(() => options.hasProvider ?? true),
    },
    jobs: { enqueue },
    logger: { debug: mock(() => {}), warn: mock(() => {}) },
  } as unknown as Pick<ServicePluginContext, "attachments" | "jobs" | "logger">;

  return {
    preflight: new PublishAssetPreflight({ context, registry }),
    enqueue,
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
