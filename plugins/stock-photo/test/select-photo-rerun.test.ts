import { describe, expect, it } from "bun:test";
import { createMockAssetStore } from "@brains/entity-service/test";
import type { BaseEntity } from "@brains/plugins";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  selectPhotoJob,
  type SelectPhotoHandlerDeps,
  type SelectPhotoJobData,
} from "../src/handlers/select-photo-handler";

/**
 * A select-photo job the queue runs again under its job id, and a second
 * job that chooses a photo already saved: the photo is saved once and
 * reused, the cover is set, and the download tracker is pinged once per
 * job, never by a rerun of a job that already pinged it. Nothing reaches
 * Unsplash: the provider and the image fetch are fakes.
 */

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const photo: SelectPhotoJobData = {
  photoId: "abc123",
  downloadLocation: "https://api.unsplash.com/photos/abc123/download",
  photographerName: "Jane Smith",
  photographerUrl: "https://unsplash.com/@janesmith",
  sourceUrl: "https://unsplash.com/photos/abc123",
  imageUrl: "https://images.unsplash.com/photo-abc123?w=1080",
};

interface Fixture {
  deps: SelectPhotoHandlerDeps;
  entities: Map<string, BaseEntity>;
  pings: string[];
  downloads: string[];
  saves: string[];
  /** Set to make the next call of that step die, as a kill would. */
  dieIn: { fetch?: boolean; cover?: boolean };
}

const key = (entityType: string, id: string): string => `${entityType}/${id}`;

function fixture(): Fixture {
  const entities = new Map<string, BaseEntity>();
  const receipts = new Set<string>();
  const assets = createMockAssetStore();
  const pings: string[] = [];
  const downloads: string[] = [];
  const saves: string[] = [];
  const dieIn: Fixture["dieIn"] = {};
  const now = new Date().toISOString();
  for (const id of ["post-a", "post-b"]) {
    entities.set(key("post", id), {
      id,
      entityType: "post",
      content: "Body",
      contentHash: "",
      visibility: "public",
      metadata: { title: id },
      created: now,
      updated: now,
    });
  }
  const deps: SelectPhotoHandlerDeps = {
    provider: {
      searchPhotos: async () => ({
        photos: [],
        total: 0,
        totalPages: 0,
        page: 1,
      }),
      triggerDownload: async (location): Promise<void> => {
        pings.push(location);
      },
    },
    fetchImage: async (url): Promise<string> => {
      downloads.push(url);
      if (dieIn.fetch) {
        dieIn.fetch = false;
        throw new Error("killed before the save");
      }
      return TINY_PNG_DATA_URL;
    },
    entityService: {
      stageAsset: assets.stageAsset,
      discardStagedAsset: assets.discardStagedAsset,
      getEntity: async ({ entityType, id }) =>
        entities.get(key(entityType, id)) ?? null,
      createEntity: async ({ entity }) => {
        const id = entity.id ?? "unnamed";
        if (entities.has(key(entity.entityType, id))) {
          throw new Error(`Entity already exists: ${entity.entityType}/${id}`);
        }
        saves.push(id);
        entities.set(key(entity.entityType, id), {
          ...entity,
          id,
          contentHash: "",
          visibility: "public",
          created: now,
          updated: now,
        });
        return { entityId: id, jobId: `embed-${id}`, skipped: false };
      },
      updateEntity: async ({ entity }) => {
        if (dieIn.cover) {
          dieIn.cover = false;
          throw new Error("killed before the cover");
        }
        entities.set(key(entity.entityType, entity.id), {
          ...entity,
          contentHash: "",
          visibility: "public",
          created: now,
          updated: now,
        });
        return { entityId: entity.id, jobId: "embed", skipped: false };
      },
    },
    receipts: {
      getEntityMutationReceipt: async (receipt) =>
        receipts.has(`${receipt.namespace}/${receipt.key}`)
          ? { operation: "none" }
          : null,
      applyEntityMutationOnce: async (request) => {
        if (request.operation !== "none") {
          throw new Error("The select-photo job records markers only");
        }
        receipts.add(`${request.receipt.namespace}/${request.receipt.key}`);
        return { operation: "none" };
      },
    },
  };
  return { deps, entities, pings, downloads, saves, dieIn };
}

function run(
  { deps }: Fixture,
  jobId: string,
  target: string,
): Promise<unknown> {
  return selectPhotoJob(deps).process({
    input: { ...photo, targetEntityType: "post", targetEntityId: target },
    jobId,
    progress: createMockProgressReporter(),
    signal: new AbortController().signal,
  });
}

/** What an attempt died of; undefined when it finished. */
function died(attempt: Promise<unknown>): Promise<unknown> {
  return attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
}

function cover(state: Fixture, target: string): unknown {
  return state.entities.get(key("post", target))?.metadata["coverImageId"];
}

describe("the select-photo job run again", () => {
  it("sets the cover from the saved photo when its run died after the save", async () => {
    const state = fixture();
    state.dieIn.cover = true;

    expect(await died(run(state, "job-1", "post-a"))).toEqual(
      new Error("killed before the cover"),
    );
    const result = await run(state, "job-1", "post-a");

    expect(result).toMatchObject({ imageEntityId: "abc123", coverSet: true });
    expect(cover(state, "post-a")).toBe("abc123");
    expect(state.pings).toEqual([photo.downloadLocation]);
    expect(state.downloads).toEqual([photo.imageUrl]);
    expect(state.saves).toEqual(["abc123"]);
  });

  it("pings once when its run died between the ping and the save", async () => {
    const state = fixture();
    state.dieIn.fetch = true;

    expect(await died(run(state, "job-1", "post-a"))).toEqual(
      new Error("killed before the save"),
    );
    const result = await run(state, "job-1", "post-a");

    expect(result).toMatchObject({ imageEntityId: "abc123", coverSet: true });
    expect(cover(state, "post-a")).toBe("abc123");
    expect(state.pings).toEqual([photo.downloadLocation]);
    expect(state.saves).toEqual(["abc123"]);
  });

  it("pings again on a rerun with no marker of its own, reusing the saved photo", async () => {
    const state = fixture();
    // An attempt before this change saved the photo and recorded nothing.
    await state.deps.entityService.createEntity({
      entity: {
        id: "abc123",
        entityType: "image",
        content: "",
        metadata: { title: "Stock photo abc123" },
      },
    });
    state.saves.length = 0;

    const result = await run(state, "job-legacy", "post-a");

    expect(result).toMatchObject({ imageEntityId: "abc123", coverSet: true });
    expect(cover(state, "post-a")).toBe("abc123");
    expect(state.pings).toEqual([photo.downloadLocation]);
    expect(state.downloads).toEqual([]);
    expect(state.saves).toEqual([]);
  });

  it("reuses a photo another job saved, pinging the tracker for this use", async () => {
    const state = fixture();

    await run(state, "job-a", "post-a");
    const result = await run(state, "job-b", "post-b");

    expect(result).toMatchObject({ imageEntityId: "abc123", coverSet: true });
    expect(cover(state, "post-a")).toBe("abc123");
    expect(cover(state, "post-b")).toBe("abc123");
    expect(state.pings).toEqual([
      photo.downloadLocation,
      photo.downloadLocation,
    ]);
    expect(state.downloads).toEqual([photo.imageUrl]);
    expect(state.saves).toEqual(["abc123"]);
  });
});
