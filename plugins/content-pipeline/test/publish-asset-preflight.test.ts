import { describe, expect, it, type Mock } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { PublishAssetPreflight } from "../src/publish-asset-preflight";
import { PublishAssetRegistry } from "../src/publish-assets";
import type { ServicePublishingAccess } from "@brains/plugins";
import { mockRuntimeFor } from "./helpers/install";

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
  enqueueAsset: Mock<ServicePublishingAccess["enqueueAsset"]>;
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

  // The runtime's namespaces are real and spied, so the preflight runs
  // against the actual attachments implementation and a spied delegation.
  const { runtime, context, enqueueAsset } = mockRuntimeFor({
    assetJobTypes: { "og-image": "image:image-render-source" },
  });
  context.attachments.hasProvider.mockImplementation(
    () => options.hasProvider ?? true,
  );

  return {
    preflight: new PublishAssetPreflight({ runtime, registry }),
    enqueueAsset,
  };
}

describe("PublishAssetPreflight", () => {
  it("enqueues missing published assets", async () => {
    const { preflight, enqueueAsset } = createPreflight();

    const result = await preflight.ensureForEntity(createPublishedPost());

    expect(result).toEqual({ checked: 1, enqueued: 1, skipped: 0 });
    expect(enqueueAsset).toHaveBeenCalledWith({
      entityType: "post",
      attachmentType: "og-image",
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
      deduplicationKey: "publish-asset:og-image:post:post-1",
    });
  });

  it("skips drafts", async () => {
    const { preflight, enqueueAsset } = createPreflight();

    const result = await preflight.ensureForEntity(
      createPublishedPost({ metadata: { status: "draft" } }),
    );

    expect(result).toEqual({ checked: 1, enqueued: 0, skipped: 1 });
    expect(enqueueAsset).not.toHaveBeenCalled();
  });

  it("skips when target field already exists", async () => {
    const { preflight, enqueueAsset } = createPreflight();

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
    expect(enqueueAsset).not.toHaveBeenCalled();
  });

  it("skips when no attachment provider exists", async () => {
    const { preflight, enqueueAsset } = createPreflight({ hasProvider: false });

    const result = await preflight.ensureForEntity(createPublishedPost());

    expect(result).toEqual({ checked: 1, enqueued: 0, skipped: 1 });
    expect(enqueueAsset).not.toHaveBeenCalled();
  });
});
