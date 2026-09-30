import { describe, expect, it, mock } from "bun:test";
import { computeAssetDigest, createAssetRef } from "@brains/entity-service";
import { createMockAssetStore } from "@brains/entity-service/test";
import { IMAGE_ASSET_MAX_BYTES, stageImageEntity } from "../src";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64");

describe("stageImageEntity", () => {
  it("stages image bytes and describes them from their headers", async () => {
    const store = createMockAssetStore();
    const stageAsset = mock(store.stageAsset);

    const { entity, stagedAsset } = await stageImageEntity(
      { stageAsset },
      { bytes: TINY_PNG },
      { title: "Robot", attachmentType: "generated" },
    );

    expect(stagedAsset.ref).toBe(createAssetRef(computeAssetDigest(TINY_PNG)));
    expect(stageAsset.mock.calls[0]?.[1]).toEqual({
      maxBytes: IMAGE_ASSET_MAX_BYTES,
    });
    expect(entity).toEqual({
      entityType: "image",
      content: stagedAsset.ref,
      metadata: {
        title: "Robot",
        alt: "Robot",
        format: "png",
        mediaType: "image/png",
        sizeBytes: TINY_PNG.byteLength,
        width: 1,
        height: 1,
        attachmentType: "generated",
      },
    });
  });

  it("stages a data URL to the same asset as its bytes", async () => {
    const store = createMockAssetStore();

    const { stagedAsset } = await stageImageEntity(
      store,
      { dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` },
      { title: "Robot" },
    );

    expect(stagedAsset.ref).toBe(createAssetRef(computeAssetDigest(TINY_PNG)));
  });

  it("rejects bytes that are not a supported raster image before staging", async () => {
    const stageAsset = mock(createMockAssetStore().stageAsset);

    expect(
      stageImageEntity(
        { stageAsset },
        { bytes: Buffer.from("<svg></svg>") },
        { title: "Vector" },
      ),
    ).rejects.toThrow("Unsupported image format");
    expect(stageAsset).not.toHaveBeenCalled();
  });
});
