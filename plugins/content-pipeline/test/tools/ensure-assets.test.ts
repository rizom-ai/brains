import { describe, expect, it } from "bun:test";
import { createMockServicePluginContext } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";
import { PublishAssetPreflight } from "../../src/publish-asset-preflight";
import { PublishAssetRegistry } from "../../src/publish-assets";
import { ensurePublishAssets } from "../../src/tools/ensure-assets";

function createPost(
  id: string,
  options: { ogImageId?: string } = {},
): BaseEntity {
  return {
    id,
    entityType: "post",
    content: `---
title: ${id}
status: published
${options.ogImageId ? `ogImageId: ${options.ogImageId}\n` : ""}---
Body`,
    visibility: "public",
    metadata: { status: "published", slug: id },
    created: "2026-06-04T12:00:00.000Z",
    updated: "2026-06-04T12:00:00.000Z",
    contentHash: `${id}-hash`,
  };
}

describe("publish asset reconciliation", () => {
  it("reconciles published entities and queues missing assets", async () => {
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
    const posts = [
      createPost("post-1"),
      createPost("post-2", { ogImageId: "existing-og" }),
    ];
    const context = createMockServicePluginContext({
      listEntitiesImpl: async () => posts,
      returns: { jobsEnqueue: "job-1" },
    });
    // The registry declares an image provider for this case, so the preflight
    // should find one; the factory reports none by default.
    context.attachments.hasProvider.mockImplementation(() => true);
    const listEntities = context.entityService.listEntities;
    const enqueue = context.jobs.enqueue;
    const preflight = new PublishAssetPreflight({ context, registry });
    const result = await ensurePublishAssets({
      context,
      registry,
      preflight,
      input: { entityType: "post", status: "published", assetType: "og-image" },
      toolContext: {
        interfaceType: "test",
        actor: { kind: "user", userId: "test-user" },
        userPermissionLevel: "admin",
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        entityType: "post",
        assetType: "og-image",
        checkedEntities: 2,
        checkedAssets: 2,
        enqueued: 1,
        skipped: 1,
      },
      message: "Queued 1 publish asset job(s)",
    });
    expect(listEntities).toHaveBeenCalledWith({
      entityType: "post",
      options: { filter: { metadata: { status: "published" } } },
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
