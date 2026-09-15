import assert from "node:assert/strict";
import { prepareImageAsset } from "@brains/image";
import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import {
  CallbackProgressReporter,
  type ProgressNotification,
  type ProgressReporter,
} from "@brains/utils/progress";
import type { StockPhotoEntityWriter } from "../src/lib/set-cover-image";
import { SelectPhotoJobHandler } from "../src/handlers/select-photo-handler";
import type { SelectPhotoJobData } from "../src/handlers/select-photo-handler";
import type { StockPhotoProvider } from "../src/lib/types";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const { facts } = prepareImageAsset(
  Buffer.from(TINY_PNG_BASE64, "base64"),
  "image/png",
);
type Files = NonNullable<StockPhotoEntityWriter["fileAssets"]>;
// Unit-only actor/native substitute: production callers exchange file metadata.
function createFiles(): Files {
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected file operation");
  };
  return {
    inspect: unused,
    fingerprint: unused,
    download: unused,
    publish: mock(
      async (): Promise<{
        entityId: string;
        jobId: string;
        skipped: boolean;
      }> => ({ entityId: "abc123", jobId: "job-1", skipped: false }),
    ),
    withRemoteFile: async (_url, use, options): ReturnType<typeof use> => {
      const signal = options?.signal ?? new AbortController().signal;
      signal.throwIfAborted();
      return use(
        {
          sourceFile: "/fixture/stock-image",
          sizeBytes: facts.sizeBytes,
          sha256: facts.digest,
          details: {
            format: facts.format,
            mediaType: facts.mediaType,
            width: facts.width,
            height: facts.height,
          },
        },
        signal,
      );
    },
    close: async (): Promise<void> => undefined,
  };
}

const jobData: SelectPhotoJobData = {
  photoId: "abc123",
  downloadLocation: "https://api.unsplash.com/photos/abc123/download",
  photographerName: "Jane Smith",
  photographerUrl: "https://unsplash.com/@janesmith",
  sourceUrl: "https://unsplash.com/photos/abc123",
  imageUrl: "https://images.unsplash.com/photo-abc123?w=1080",
};

function createProvider(): StockPhotoProvider {
  return {
    searchPhotos: async () => ({
      photos: [],
      total: 0,
      totalPages: 0,
      page: 1,
    }),
    triggerDownload: async (): Promise<void> => {},
  };
}

function createEntityService(
  overrides: Record<string, unknown> = {},
): StockPhotoEntityWriter {
  return {
    getEntity: async () => null,
    fileAssets: createFiles(),
    updateEntity: async () => ({
      entityId: "test-id",
      jobId: "job-2",
      skipped: false,
    }),
    ...overrides,
  } satisfies StockPhotoEntityWriter;
}

function createProgressReporter(): ProgressReporter {
  const reporter = CallbackProgressReporter.from(
    async (_notification: ProgressNotification) => {},
  );
  if (!reporter) {
    throw new Error("Failed to create progress reporter");
  }
  return reporter;
}

describe("SelectPhotoJobHandler", () => {
  let progressReporter: ProgressReporter;

  beforeEach(() => {
    progressReporter = createProgressReporter();
  });

  it("requires file ingress before tracking and rejects pre-cancelled selection", async () => {
    const entityService = createEntityService();
    delete entityService.fileAssets;
    const provider = createProvider();
    const tracking = spyOn(provider, "triggerDownload");
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      entityService,
      provider,
    });
    await assert.rejects(
      handler.process(jobData, "job", progressReporter),
      /file ingress is not provisioned/,
    );
    const caller = new AbortController();
    const primary = new Error("selection cancelled");
    caller.abort(primary);
    await assert.rejects(
      handler.process(jobData, "job", progressReporter, caller.signal),
      (error: unknown) => error === primary,
    );
    expect(tracking).not.toHaveBeenCalled();
  });

  it("tracks first and publishes canonical metadata through the file capability", async () => {
    const entityService = createEntityService();
    const files = entityService.fileAssets;
    assert.ok(files?.withRemoteFile);
    const events: string[] = [];
    const provider = createProvider();
    provider.triggerDownload = async (location): Promise<void> => {
      expect(location).toBe(jobData.downloadLocation);
      events.push("tracking");
    };
    const original = files.withRemoteFile;
    files.withRemoteFile = async (
      url,
      use,
      options,
    ): ReturnType<typeof use> => {
      expect(url).toBe(jobData.imageUrl);
      events.push("ingress");
      return original(url, use, options);
    };
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      entityService,
      provider,
    });
    await handler.process(
      { ...jobData, title: "Selected title", alt: "Selected alt" },
      "job",
      progressReporter,
    );
    expect(events).toEqual(["tracking", "ingress"]);
    expect(files.publish).toHaveBeenCalledWith(
      {
        sourceFile: "/fixture/stock-image",
        sizeBytes: facts.sizeBytes,
        publication: {
          operation: "createEntity",
          request: {
            entity: expect.objectContaining({
              id: "abc123",
              entityType: "image",
              content: facts.ref,
              metadata: expect.objectContaining({
                title: "Selected title",
                alt: "Selected alt",
                sourceUrl: jobData.imageUrl,
                sizeBytes: facts.sizeBytes,
              }),
            }),
          },
        },
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("waits for cancelled ingress without publishing or updating a target", async () => {
    const entityService = createEntityService();
    const files = entityService.fileAssets;
    assert.ok(files);
    const entered = Promise.withResolvers<void>();
    const retire = Promise.withResolvers<void>();
    const caller = new AbortController();
    const primary = new Error("ingress cancelled");
    files.withRemoteFile = async (_url, _use, options): Promise<never> => {
      expect(options?.signal).toBe(caller.signal);
      entered.resolve();
      await retire.promise;
      throw primary;
    };
    const lookup = spyOn(entityService, "getEntity");
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      entityService,
      provider: createProvider(),
    });
    let settled = false;
    const work = handler
      .process(
        { ...jobData, targetEntityType: "post", targetEntityId: "target" },
        "job",
        progressReporter,
        caller.signal,
      )
      .finally(() => {
        settled = true;
      });
    const rejected = assert.rejects(
      work,
      (error: unknown) => error === primary,
    );
    try {
      await entered.promise;
      caller.abort(primary);
      expect(settled).toBe(false);
    } finally {
      retire.resolve();
      await rejected;
    }
    expect(files.publish).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not update the target or replay an unavailable publication outcome", async () => {
    const entityService = createEntityService();
    const files = entityService.fileAssets;
    assert.ok(files);
    const primary = new Error("publication outcome unavailable");
    files.publish = mock(async (): Promise<never> => {
      throw primary;
    });
    const lookup = spyOn(entityService, "getEntity");
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      entityService,
      provider: createProvider(),
    });
    await assert.rejects(
      handler.process(
        { ...jobData, targetEntityType: "post", targetEntityId: "target" },
        "job",
        progressReporter,
      ),
      (error: unknown) => error === primary,
    );
    expect(files.publish).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("preserves the published image when cancellation stops the subsequent target update", async () => {
    const caller = new AbortController();
    const entityService = createEntityService({
      getEntity: async () => {
        caller.abort(new Error("target lookup cancelled"));
        return {
          id: "target",
          entityType: "post",
          content: "body",
          metadata: {},
        };
      },
    });
    const update = spyOn(entityService, "updateEntity");
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      entityService,
      provider: createProvider(),
    });
    const result = await handler.process(
      { ...jobData, targetEntityType: "post", targetEntityId: "target" },
      "job",
      progressReporter,
      caller.signal,
    );
    expect(result).toEqual({
      imageEntityId: "abc123",
      alreadyExisted: false,
      coverSet: false,
      warning: "Image saved; cover image update cancelled",
    });
    expect(entityService.fileAssets?.publish).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns an acknowledged publication without reporting through a cancelled progress channel", async () => {
    const caller = new AbortController();
    const entityService = createEntityService();
    const files = entityService.fileAssets;
    assert.ok(files);
    files.publish = mock(async (): ReturnType<Files["publish"]> => {
      caller.abort(new Error("cancelled after publication"));
      return { entityId: "abc123", jobId: "job", skipped: false };
    });
    const reporter = CallbackProgressReporter.from(async (): Promise<void> =>
      caller.signal.throwIfAborted(),
    );
    assert.ok(reporter);
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      entityService,
      provider: createProvider(),
    });
    expect(
      await handler.process(jobData, "job", reporter, caller.signal),
    ).toEqual({ imageEntityId: "abc123", alreadyExisted: false });
    expect(files.publish).toHaveBeenCalledTimes(1);
  });

  it("does not classify an admitted target update failure as safely cancelled", async () => {
    const caller = new AbortController();
    const primary = new Error("target update outcome unavailable");
    const update = mock(async (): Promise<never> => {
      caller.abort(primary);
      throw primary;
    });
    const entityService = createEntityService({
      getEntity: async () => ({
        id: "target",
        entityType: "post",
        content: "body",
        metadata: {},
      }),
      updateEntity: update,
    });
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      entityService,
      provider: createProvider(),
    });
    await assert.rejects(
      handler.process(
        { ...jobData, targetEntityType: "post", targetEntityId: "target" },
        "job",
        progressReporter,
        caller.signal,
      ),
      (error: unknown) => error === primary,
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(entityService.fileAssets?.publish).toHaveBeenCalledTimes(1);
  });

  it("sets the cover image when the target entity exists", async () => {
    let updatedEntity: { metadata?: Record<string, unknown> } | undefined;
    const entityService = createEntityService({
      getEntity: async (request: { entityType: string; id: string }) => {
        if (request.id === "my-post") {
          return {
            id: "my-post",
            entityType: "post",
            content: "test",
            metadata: { title: "My Post" },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        return null;
      },
      updateEntity: async (request: {
        entity: { id: string; metadata?: Record<string, unknown> };
      }) => {
        updatedEntity = request.entity;
        return { entityId: request.entity.id, jobId: "job-2", skipped: false };
      },
    });

    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      provider: createProvider(),
      entityService,
    });

    const result = await handler.process(
      { ...jobData, targetEntityType: "post", targetEntityId: "my-post" },
      "job-123",
      progressReporter,
    );

    expect(result.coverSet).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(updatedEntity?.metadata).toMatchObject({ coverImageId: "abc123" });
  });

  it("reports the cover as not set when the target entity is missing", async () => {
    let updateCalled = false;
    const entityService = createEntityService({
      updateEntity: async (request: { entity: { id: string } }) => {
        updateCalled = true;
        return { entityId: request.entity.id, jobId: "job-2", skipped: false };
      },
    });

    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      provider: createProvider(),
      entityService,
    });

    const result = await handler.process(
      { ...jobData, targetEntityType: "post", targetEntityId: "missing" },
      "job-123",
      progressReporter,
    );

    expect(result.coverSet).toBe(false);
    expect(result.warning).toContain("post:missing");
    expect(updateCalled).toBe(false);
  });

  it("omits cover fields when no target entity is requested", async () => {
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      provider: createProvider(),
      entityService: createEntityService(),
    });

    const result = await handler.process(jobData, "job-123", progressReporter);

    expect(result.imageEntityId).toBe("abc123");
    expect(result.coverSet).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });
});
