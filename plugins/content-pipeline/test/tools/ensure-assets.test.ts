import { describe, expect, it, mock } from "bun:test";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { PublishAssetPreflight } from "../../src/publish-asset-preflight";
import { PublishAssetRegistry } from "../../src/publish-assets";
import { createEnsureAssetsTool } from "../../src/tools/ensure-assets";

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

describe("ensure-assets tool", () => {
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
    const enqueue = mock(async () => "job-1");
    const listEntities = mock(async () => [
      createPost("post-1"),
      createPost("post-2", { ogImageId: "existing-og" }),
    ]);
    const context = {
      permissions: {
        assertEntityActionAllowed: mock(() => {}),
      },
      entityService: { listEntities },
      attachments: { hasProvider: mock(() => true) },
      jobs: { enqueue },
      logger: { debug: mock(() => {}), warn: mock(() => {}) },
    } as unknown as ServicePluginContext;
    const preflight = new PublishAssetPreflight({ context, registry });
    const tool = createEnsureAssetsTool(
      context,
      "content-pipeline",
      registry,
      preflight,
    );

    const result = await tool.handler(
      { entityType: "post", status: "published", assetType: "og-image" },
      {
        interfaceType: "test",
        userId: "test-user",
        userPermissionLevel: "anchor",
      },
    );

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
