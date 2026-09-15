import { prepareAsset } from "@brains/assets";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it, spyOn } from "bun:test";
import assert from "node:assert/strict";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";
import { createSilentLogger } from "@brains/test-utils";
import { SourceImageRenderJobHandler } from "../../src/handlers/source-image-render-handler";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64");

function createProgressReporter(): ProgressReporter {
  const reporter = CallbackProgressReporter.from(async () => {});
  if (!reporter) throw new Error("Failed to create progress reporter");
  return reporter;
}

const request = {
  sourceEntityType: "post",
  sourceEntityId: "post-1",
  attachmentType: "og-image",
  imageId: "rendered-image",
};
const readyImage = {
  id: request.imageId,
  entityType: "image",
  content: prepareAsset(TINY_PNG).ref,
  metadata: {
    title: "Rendered",
    alt: "Rendered",
    status: "draft",
    format: "png",
    mediaType: "image/png",
    sizeBytes: TINY_PNG.length,
    width: 1,
    height: 1,
  },
  contentHash: "hash",
  visibility: "shared" as const,
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};
function renderingContext(): ReturnType<typeof createMockEntityPluginContext> {
  return createMockEntityPluginContext({
    returns: {
      entityService: { getEntity: null },
      attachmentsResolve: async () => ({
        type: "image" as const,
        data: TINY_PNG,
        mimeType: "image/png" as const,
        filename: "rendered.png",
      }),
    },
    listEntitiesImpl: async () => [
      {
        ...readyImage,
        id: "post-1",
        entityType: "post",
        content: "---\ntitle: Post\n---\nBody",
      },
    ],
  });
}

describe("SourceImageRenderJobHandler", () => {
  it("does not fail a committed image when the target update fails", async () => {
    const context = renderingContext();
    spyOn(context.entityService, "getEntity")
      .mockResolvedValueOnce(null)
      .mockResolvedValue(readyImage);
    const primary = new Error("target update failed");
    spyOn(context.entities, "update").mockRejectedValue(primary);
    const handler = new SourceImageRenderJobHandler(
      context,
      createSilentLogger(),
    );
    const result = await handler.process(
      { ...request, targetEntityType: "post", targetEntityId: "post-1" },
      "job",
      createProgressReporter(),
    );
    expect(result).toEqual({ success: false, error: primary.message });
    expect(context.entityService.createEntity).toHaveBeenCalledTimes(1);
    expect(context.entities.update).toHaveBeenCalledTimes(1);
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });

  it("does not issue a failed-placeholder mutation after an unavailable publication reply", async () => {
    const context = renderingContext();
    spyOn(context.entityService, "getEntity")
      .mockResolvedValueOnce(null)
      .mockResolvedValue(readyImage);
    const primary = new Error("publication outcome unavailable");
    spyOn(context.entityService, "createEntity").mockRejectedValue(primary);
    const handler = new SourceImageRenderJobHandler(
      context,
      createSilentLogger(),
    );
    expect(
      await handler.process(request, "job", createProgressReporter()),
    ).toEqual({ success: false, error: primary.message });
    expect(context.entityService.createEntity).toHaveBeenCalledTimes(1);
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
    expect(context.entities.update).not.toHaveBeenCalled();
  });

  it("does not fail a reused image when its target cannot be updated", async () => {
    const context = createMockEntityPluginContext({
      returns: { entityService: { getEntity: readyImage } },
      listEntitiesImpl: async () => [readyImage],
    });
    spyOn(context.entities, "update").mockRejectedValue(
      new Error("target failed"),
    );
    const handler = new SourceImageRenderJobHandler(
      context,
      createSilentLogger(),
    );
    const result = await handler.process(
      {
        ...request,
        dedupKey: "existing",
        targetEntityType: "image",
        targetEntityId: readyImage.id,
      },
      "job",
      createProgressReporter(),
    );
    expect(result.success).toBe(false);
    expect(context.entityService.createEntity).not.toHaveBeenCalled();
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
    expect(context.attachments.resolve).not.toHaveBeenCalled();
  });

  it("retains rendering and failed-placeholder update causes", async () => {
    const context = renderingContext();
    const primary = new Error("render failed");
    const cleanup = new Error("failure update failed");
    spyOn(context.attachments, "resolve").mockRejectedValue(primary);
    spyOn(context.entityService, "getEntity").mockResolvedValue(readyImage);
    spyOn(context.entityService, "updateEntity").mockRejectedValue(cleanup);
    const handler = new SourceImageRenderJobHandler(
      context,
      createSilentLogger(),
    );
    await assert.rejects(
      handler.process(request, "job", createProgressReporter()),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        expect(error.errors).toEqual([primary, cleanup]);
        expect(error.cause).toBe(primary);
        return true;
      },
    );
  });

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
    const preparedAsset = prepareAsset(TINY_PNG);
    expect(context.entityService.createEntity).toHaveBeenCalledWith({
      entity: expect.objectContaining({
        id: "og-post-post-1",
        entityType: "image",
        content: preparedAsset.ref,
        metadata: expect.objectContaining({
          attachmentType: "og-image",
          sourceEntityType: "post",
          sourceEntityId: "post-1",
        }),
      }),
      preparedAsset,
    });
    expect(context.entities.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "post-1",
        content: expect.stringContaining("ogImageId: og-post-post-1"),
      }),
    );
  });
});
