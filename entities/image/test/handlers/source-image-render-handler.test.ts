import { prepareAsset } from "@brains/assets";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import type { EntityPluginContext } from "@brains/plugins";
import { describe, expect, it, spyOn, mock } from "bun:test";
import assert from "node:assert/strict";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";
import { createSilentLogger } from "@brains/test-utils";
import { SourceImageRenderJobHandler } from "../../src/handlers/source-image-render-handler";

const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const asset = prepareAsset(bytes);
const source = { sourceFile: "/trusted/rendered.png", sizeBytes: bytes.length };
const request = {
  sourceEntityType: "post",
  sourceEntityId: "post-1",
  attachmentType: "og-image",
  imageId: "rendered-image",
};
const readyImage = {
  id: request.imageId,
  entityType: "image",
  content: asset.ref,
  metadata: {
    title: "Rendered",
    alt: "Rendered",
    status: "draft",
    format: "png",
    mediaType: "image/png",
    sizeBytes: bytes.length,
    width: 1,
    height: 1,
  },
  contentHash: "hash",
  visibility: "shared" as const,
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};
function reporter(): ProgressReporter {
  const value = CallbackProgressReporter.from(async () => {});
  assert.ok(value);
  return value;
}
function setup(): {
  context: ReturnType<typeof createMockEntityPluginContext>;
  files: NonNullable<EntityPluginContext["entityService"]["fileAssets"]>;
  handler: SourceImageRenderJobHandler;
} {
  const context = createMockEntityPluginContext({
    returns: { entityService: { getEntity: null } },
    listEntitiesImpl: async () => [
      {
        ...readyImage,
        id: "post-1",
        entityType: "post",
        content: "---\ntitle: Post\n---\nBody",
      },
    ],
  });
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected file operation");
  };
  const files: NonNullable<EntityPluginContext["entityService"]["fileAssets"]> =
    {
      inspect: mock(async () => ({
        sha256: asset.digest,
        sizeBytes: bytes.length,
        details: { format: "png", mediaType: "image/png", width: 1, height: 1 },
      })),
      publish: mock(async ({ publication }) =>
        publication.operation === "createEntity"
          ? context.entityService.createEntity(publication.request)
          : context.entityService.updateEntity(publication.request),
      ),
      withAssetFile: unexpected,
      download: unexpected,
      fingerprint: unexpected,
      close: async (): Promise<void> => undefined,
    };
  context.entityService.fileAssets = files;
  context.attachments.register("post", "og-image", {
    withFile: async (_request, use, options): ReturnType<typeof use> => {
      assert.ok(options?.signal);
      return use(
        {
          source,
          sha256: asset.digest,
          filename: "rendered.png",
          mimeType: "image/png",
          type: "image",
        },
        options.signal,
      );
    },
  });
  return {
    context,
    files,
    handler: new SourceImageRenderJobHandler(context, createSilentLogger()),
  };
}
const signal = new AbortController().signal;
describe("SourceImageRenderJobHandler", () => {
  it("publishes the inspected file and updates ogImageId without buffered resolution", async () => {
    const { context, files, handler } = setup();
    const result = await handler.process(
      {
        ...request,
        targetEntityType: "post",
        targetEntityId: "post-1",
        targetImageField: "ogImageId",
      },
      "job",
      reporter(),
      signal,
    );
    expect(result).toEqual({
      success: true,
      imageId: request.imageId,
      reused: false,
    });
    expect(context.attachments.resolve).not.toHaveBeenCalled();
    expect(files.inspect).toHaveBeenCalledWith(source, { signal });
    expect(files.publish).toHaveBeenCalledWith(
      {
        ...source,
        publication: {
          operation: "createEntity",
          request: {
            entity: expect.objectContaining({
              id: request.imageId,
              content: asset.ref,
              metadata: expect.objectContaining({
                attachmentType: "og-image",
                sourceEntityType: "post",
                sourceEntityId: "post-1",
              }),
            }),
          },
        },
      },
      { signal },
    );
    expect(context.entities.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "post-1",
        content: expect.stringContaining("ogImageId: rendered-image"),
      }),
    );
  });
  it("does not fail a committed image when the target update fails", async () => {
    const { context, files, handler } = setup();
    const primary = new Error("target update failed");
    spyOn(context.entityService, "getEntity")
      .mockResolvedValueOnce(null)
      .mockResolvedValue(readyImage);
    spyOn(context.entities, "update").mockRejectedValue(primary);
    expect(
      await handler.process(
        { ...request, targetEntityType: "post", targetEntityId: "post-1" },
        "job",
        reporter(),
        signal,
      ),
    ).toEqual({ success: false, error: primary.message });
    expect(files.publish).toHaveBeenCalledTimes(1);
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });
  it("keeps publication when provider cleanup fails after consumption", async () => {
    const { context, files, handler } = setup();
    const primary = new Error("provider cleanup failed");
    spyOn(context.entityService, "getEntity")
      .mockResolvedValueOnce(null)
      .mockResolvedValue(readyImage);
    context.attachments.register("post", "cleanup", {
      withFile: async (_request, use, options): ReturnType<typeof use> => {
        assert.ok(options?.signal);
        await use(
          {
            source,
            sha256: asset.digest,
            filename: "rendered.png",
            type: "image",
            mimeType: "image/png",
          },
          options.signal,
        );
        throw primary;
      },
    });
    expect(
      await handler.process(
        { ...request, attachmentType: "cleanup" },
        "job",
        reporter(),
        signal,
      ),
    ).toEqual({ success: false, error: primary.message });
    expect(files.publish).toHaveBeenCalledTimes(1);
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });
  it("does not downgrade an admitted target failure to late cancellation", async () => {
    const { context, files, handler } = setup();
    const caller = new AbortController();
    const primary = new Error("admitted target outcome unavailable");
    context.entities.update.mockImplementation(async (): Promise<never> => {
      caller.abort();
      throw primary;
    });
    await assert.rejects(
      handler.process(
        { ...request, targetEntityType: "post", targetEntityId: "post-1" },
        "job",
        reporter(),
        caller.signal,
      ),
      (error: unknown) => error === primary,
    );
    expect(files.publish).toHaveBeenCalledTimes(1);
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });
  it("does not mutate the placeholder after an unavailable publication reply", async () => {
    const { context, files, handler } = setup();
    const primary = new Error("publication outcome unavailable");
    spyOn(context.entityService, "getEntity")
      .mockResolvedValueOnce(null)
      .mockResolvedValue(readyImage);
    spyOn(files, "publish").mockRejectedValue(primary);
    expect(await handler.process(request, "job", reporter(), signal)).toEqual({
      success: false,
      error: primary.message,
    });
    expect(files.publish).toHaveBeenCalledTimes(1);
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });
  it("preserves a reused image after target failure without resolving a file", async () => {
    const { context, handler } = setup();
    spyOn(context.entityService, "listEntities").mockResolvedValue([
      readyImage,
    ]);
    spyOn(context.entities, "update").mockRejectedValue(
      new Error("target failed"),
    );
    const result = await handler.process(
      {
        ...request,
        dedupKey: "existing",
        targetEntityType: "image",
        targetEntityId: readyImage.id,
      },
      "job",
      reporter(),
      signal,
    );
    expect(result.success).toBe(false);
    expect(context.attachments.withFile).not.toHaveBeenCalled();
    expect(context.entityService.getEntity).toHaveBeenCalledTimes(1); // Target lookup only.
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });
  it("retains rendering and failed-placeholder update causes", async () => {
    const { context, handler } = setup();
    const primary = new Error("render failed"),
      secondary = new Error("failure update failed");
    spyOn(context.attachments, "withFile").mockRejectedValue(primary);
    spyOn(context.entityService, "getEntity").mockResolvedValue(readyImage);
    spyOn(context.entityService, "updateEntity").mockRejectedValue(secondary);
    await assert.rejects(
      handler.process(request, "job", reporter(), signal),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        expect(error.errors).toEqual([primary, secondary]);
        expect(error.cause).toBe(primary);
        return true;
      },
    );
  });
  it("does not publish a file whose inspection differs from the producer receipt", async () => {
    const { files, handler } = setup();
    spyOn(files, "inspect").mockResolvedValue({
      sha256: "a".repeat(64),
      sizeBytes: bytes.length,
      details: { format: "png", mediaType: "image/png", width: 1, height: 1 },
    });
    const result = await handler.process(request, "job", reporter(), signal);
    expect(result.success).toBe(false);
    expect(files.publish).not.toHaveBeenCalled();
  });
  it("rejects pre-cancelled work before lookup or file acquisition", async () => {
    const { context, handler } = setup();
    const caller = new AbortController();
    const primary = new Error("cancelled");
    caller.abort(primary);
    await assert.rejects(
      handler.process(request, "job", reporter(), caller.signal),
      (error: unknown) => error === primary,
    );
    expect(context.attachments.withFile).not.toHaveBeenCalled();
    expect(context.entityService.getEntity).not.toHaveBeenCalled();
  });
  it("cancellation during inspection never publishes or marks the pending image failed", async () => {
    const { context, files, handler } = setup();
    const caller = new AbortController();
    const primary = new Error("inspection cancelled");
    spyOn(files, "inspect").mockImplementation(async (): Promise<never> => {
      caller.abort(primary);
      throw primary;
    });
    await assert.rejects(
      handler.process(request, "job", reporter(), caller.signal),
      (error: unknown) => error === primary,
    );
    expect(files.publish).not.toHaveBeenCalled();
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });
  it("keeps acknowledged publication when cancellation prevents target admission", async () => {
    const { context, files, handler } = setup();
    const caller = new AbortController();
    spyOn(files, "publish").mockImplementation(async () => {
      caller.abort(new Error("late cancellation"));
      return { entityId: request.imageId, jobId: "published", skipped: false };
    });
    const result = await handler.process(
      { ...request, targetEntityType: "post", targetEntityId: "post-1" },
      "job",
      reporter(),
      caller.signal,
    );
    expect(result).toEqual({
      success: true,
      imageId: request.imageId,
      reused: false,
      warning: "Image saved; target update cancelled",
    });
    expect(context.entities.update).not.toHaveBeenCalled();
    expect(context.entityService.updateEntity).not.toHaveBeenCalled();
  });
});
