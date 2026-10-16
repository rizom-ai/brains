import { describe, it, expect, beforeEach } from "bun:test";
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
import { computeAssetDigest, createAssetRef } from "@brains/plugins";
import { createMockAssetStore } from "@brains/entity-service/test";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

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
    stageAsset: createMockAssetStore().stageAsset,
    getEntity: async () => null,
    createEntity: async () => ({
      entityId: "abc123",
      jobId: "job-1",
      skipped: false,
    }),
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
      fetchImage: async (): Promise<string> => TINY_PNG_DATA_URL,
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
      fetchImage: async (): Promise<string> => TINY_PNG_DATA_URL,
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
      fetchImage: async (): Promise<string> => TINY_PNG_DATA_URL,
    });

    const result = await handler.process(jobData, "job-123", progressReporter);

    expect(result.imageEntityId).toBe("abc123");
    expect(result.coverSet).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it("stores the downloaded photo as a staged asset", async () => {
    let created: { entity?: unknown; stagedAsset?: unknown } | undefined;
    const entityService = createEntityService({
      createEntity: async (request: {
        entity: unknown;
        stagedAsset?: unknown;
      }) => {
        created = request;
        return { entityId: "abc123", jobId: "job-1", skipped: false };
      },
    });
    const handler = new SelectPhotoJobHandler(createSilentLogger(), {
      provider: createProvider(),
      entityService,
      fetchImage: async (): Promise<string> => TINY_PNG_DATA_URL,
    });

    await handler.process(jobData, "job-123", progressReporter);

    const ref = createAssetRef(
      computeAssetDigest(Buffer.from(TINY_PNG_BASE64, "base64")),
    );
    expect(created).toEqual({
      entity: expect.objectContaining({
        id: "abc123",
        entityType: "image",
        content: ref,
        metadata: expect.objectContaining({
          format: "png",
          mediaType: "image/png",
          sourceUrl: jobData.imageUrl,
        }),
      }),
      stagedAsset: expect.objectContaining({ ref }),
    });
  });
});
