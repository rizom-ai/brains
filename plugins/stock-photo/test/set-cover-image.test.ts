import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { createRacingStore } from "@brains/test-utils";
import {
  setCoverImage,
  type StockPhotoEntityWriter,
} from "../src/lib/set-cover-image";

const post: BaseEntity = {
  id: "hello",
  entityType: "post",
  content: "---\ntitle: Hello\n---\n\nFirst version\n",
  metadata: { title: "Hello" },
  visibility: "public",
  contentHash: "hash-first",
  created: "2026-11-01T10:00:00.000Z",
  updated: "2026-11-01T10:00:00.000Z",
};

function writer(store: ReturnType<typeof createRacingStore<BaseEntity>>): {
  service: StockPhotoEntityWriter;
} {
  const unused = async (): Promise<never> => {
    throw new Error("Not used by setCoverImage");
  };
  return {
    service: {
      getEntity: async ({ entityType, id }) => store.get(entityType, id),
      updateEntity: async (request) =>
        store.update(request.entity, request.options?.expectedContentHash),
      createEntity: unused,
      stageAsset: unused,
      discardStagedAsset: unused,
    },
  };
}

describe("setCoverImage", () => {
  it("sets the cover on the version it read", async () => {
    const store = createRacingStore([post]);

    expect(
      await setCoverImage(writer(store).service, "post", "hello", "img"),
    ).toBe(true);
    expect(store.applied).toEqual([
      {
        entity: { ...post, metadata: { title: "Hello", coverImageId: "img" } },
        expectedContentHash: "hash-first",
      },
    ]);
  });

  it("keeps an edit made between its read and its write, with the cover set on it", async () => {
    const store = createRacingStore([post]);
    store.beforeNextUpdate(() =>
      store.edit("post", "hello", (current) => ({
        ...current,
        content: "---\ntitle: Hello\n---\n\nEdited in Studio\n",
      })),
    );

    expect(
      await setCoverImage(writer(store).service, "post", "hello", "img"),
    ).toBe(true);
    const stored = store.get("post", "hello");
    expect(stored?.content).toContain("Edited in Studio");
    expect(stored?.metadata["coverImageId"]).toBe("img");
  });

  it("sets nothing on an entity that is gone", async () => {
    const store = createRacingStore<BaseEntity>([]);

    expect(
      await setCoverImage(writer(store).service, "post", "hello", "img"),
    ).toBe(false);
  });
});
