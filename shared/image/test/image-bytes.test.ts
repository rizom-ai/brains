import { describe, expect, it, mock } from "bun:test";
import { createMockAssetStore } from "@brains/entity-service/test";
import { imageDataUrl, readImageBytes } from "../src";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("readImageBytes", () => {
  it("reads an asset-backed image from its stored chunks", async () => {
    const store = createMockAssetStore();
    const asset = await store.stageAsset(PNG);

    const result = await readImageBytes(store, {
      content: asset.ref,
      metadata: { mediaType: "image/png" },
    });

    expect(result?.mediaType).toBe("image/png");
    expect(result?.bytes.equals(PNG)).toBe(true);
  });

  it("derives the media type from the format when none is recorded", async () => {
    const store = createMockAssetStore();
    const asset = await store.stageAsset(PNG);

    const result = await readImageBytes(store, {
      content: asset.ref,
      metadata: { format: "jpg" },
    });

    expect(result?.mediaType).toBe("image/jpeg");
  });

  it("decodes inline data URLs without touching the asset store", async () => {
    const openAsset = mock(createMockAssetStore().openAsset);

    const result = await readImageBytes(
      { openAsset },
      {
        content: `data:image/png;base64,${PNG.toString("base64")}`,
        metadata: {},
      },
    );

    expect(result?.mediaType).toBe("image/png");
    expect(result?.bytes.equals(PNG)).toBe(true);
    expect(openAsset).not.toHaveBeenCalled();
  });

  it("returns undefined for content that is neither", async () => {
    expect(
      await readImageBytes(createMockAssetStore(), {
        content: "not an image",
        metadata: {},
      }),
    ).toBeUndefined();
  });
});

describe("imageDataUrl", () => {
  it("builds a data URL from an asset-backed image", async () => {
    const store = createMockAssetStore();
    const asset = await store.stageAsset(PNG);

    expect(
      await imageDataUrl(store, {
        content: asset.ref,
        metadata: { mediaType: "image/png" },
      }),
    ).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
  });

  it("returns an inline data URL unchanged", async () => {
    const inline = `data:image/png;base64,${PNG.toString("base64")}`;

    expect(
      await imageDataUrl(createMockAssetStore(), {
        content: inline,
        metadata: {},
      }),
    ).toBe(inline);
  });
});
