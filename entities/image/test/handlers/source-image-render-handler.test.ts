import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it, spyOn } from "bun:test";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity, GetEntityRequest } from "@brains/plugins";
import { SourceImageRenderJobHandler } from "../../src/handlers/source-image-render-handler";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64");

function createProgressReporter(): ProgressReporter {
  const reporter = CallbackProgressReporter.from(async () => {});
  if (!reporter) throw new Error("Failed to create progress reporter");
  return reporter;
}

describe("SourceImageRenderJobHandler", () => {
  it("creates an image entity from a source attachment and sets ogImageId", async () => {
    const target = {
      id: "post-1",
      entityType: "post",
      content: "---\ntitle: Post\n---\nBody",
      metadata: { title: "Post", slug: "post-1" },
      contentHash: "hash",
      visibility: "public" as const,
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    };
    const context = createMockEntityPluginContext({
      returns: {
        entityService: {
          getEntity: null,
        },
        attachmentsResolve: async () => ({
          type: "image" as const,
          data: TINY_PNG,
          mimeType: "image/png" as const,
          filename: "post-og.png",
        }),
      },
      listEntitiesImpl: async (request) =>
        request.entityType === "post" ? [target] : [],
    });

    const handler = new SourceImageRenderJobHandler(
      context,
      createSilentLogger(),
    );
    const result = await handler.process(
      {
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        attachmentType: "og-image",
        imageId: "og-post-post-1",
        targetEntityType: "post",
        targetEntityId: "post-1",
        targetImageField: "ogImageId",
      },
      "job-1",
      createProgressReporter(),
    );

    expect(result).toEqual({
      success: true,
      imageId: "og-post-post-1",
      reused: false,
    });
    expect(context.entityService.createEntity).toHaveBeenCalledWith({
      entity: expect.objectContaining({
        id: "og-post-post-1",
        entityType: "image",
        content: expect.stringContaining("data:image/png;base64,"),
        metadata: expect.objectContaining({
          attachmentType: "og-image",
          sourceEntityType: "post",
          sourceEntityId: "post-1",
        }),
      }),
    });
    expect(context.entities.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "post-1",
        content: expect.stringContaining("ogImageId: og-post-post-1"),
      }),
    );
  });

  it("writes the target's stored body back, never one with resolved image references", async () => {
    const stored = {
      id: "post-1",
      entityType: "post",
      content: "---\ntitle: Post\n---\nBody ![Figure](entity://image/figure)",
      metadata: { title: "Post", slug: "post-1" },
      contentHash: "hash",
      visibility: "public" as const,
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    };
    const context = createMockEntityPluginContext({
      returns: {
        attachmentsResolve: async () => ({
          type: "image" as const,
          data: TINY_PNG,
          mimeType: "image/png" as const,
          filename: "post-og.png",
        }),
      },
    });
    // A resolving read inlines the body image; only the stored read is safe to write back.
    spyOn(context.entityService, "getEntity").mockImplementation(
      async (request: GetEntityRequest): Promise<BaseEntity | null> =>
        request.entityType === "post"
          ? {
              ...stored,
              content: stored.content.replace(
                "entity://image/figure",
                `data:image/png;base64,${TINY_PNG_BASE64}`,
              ),
            }
          : null,
    );
    spyOn(context.entityService, "getEntityRaw").mockImplementation(
      async (request: GetEntityRequest): Promise<BaseEntity | null> =>
        request.entityType === "post" ? stored : null,
    );

    await new SourceImageRenderJobHandler(
      context,
      createSilentLogger(),
    ).process(
      {
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        attachmentType: "og-image",
        imageId: "og-post-post-1",
        targetEntityType: "post",
        targetEntityId: "post-1",
        targetImageField: "ogImageId",
      },
      "job-1",
      createProgressReporter(),
    );

    expect(context.entities.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("![Figure](entity://image/figure)"),
      }),
    );
  });
});
