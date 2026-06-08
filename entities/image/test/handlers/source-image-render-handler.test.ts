import { describe, expect, it } from "bun:test";
import { ProgressReporter } from "@brains/utils";
import {
  createMockEntityPluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import { SourceImageRenderJobHandler } from "../../src/handlers/source-image-render-handler";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64");

function createProgressReporter(): ProgressReporter {
  const reporter = ProgressReporter.from(async () => {});
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
          getEntity: target,
        },
        attachmentsResolve: async () => ({
          type: "image" as const,
          data: TINY_PNG,
          mimeType: "image/png" as const,
          filename: "post-og.png",
        }),
      },
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
    // Replace in place (not delete-then-create) when the image already exists,
    // so a failure can't leave the target without an image.
    expect(context.entityService.updateEntity).toHaveBeenCalledWith({
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
});
