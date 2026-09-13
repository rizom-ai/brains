import { describe, expect, it } from "bun:test";
import { computeAssetDigest } from "@brains/assets";
import { prepareImageAsset, imageAssetFactsSchema, imageAdapter } from "../src";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("producer image preparation", () => {
  it("inspects the owned asset and returns serializable facts without bytes", () => {
    const input = Uint8Array.from(PNG);
    const { asset, facts } = prepareImageAsset(input, "image/png");
    input.fill(0);
    expect(asset.bytes).toEqual(new Uint8Array(PNG));
    expect(facts).toEqual({
      ref: asset.ref,
      digest: computeAssetDigest(PNG),
      sizeBytes: PNG.byteLength,
      format: "png",
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
    expect(
      imageAssetFactsSchema.parse(JSON.parse(JSON.stringify(facts))),
    ).toEqual(facts);
    expect(
      imageAdapter.createImageEntity({ facts, title: "Owned" }).content,
    ).toBe(asset.ref);
  });

  it("still rejects unsupported bytes and incorrect declared media types at the producer", () => {
    expect(() => prepareImageAsset(new Uint8Array(32))).toThrow(
      "Unsupported image signature",
    );
    expect(() => prepareImageAsset(PNG, "image/jpeg")).toThrow(
      "does not match",
    );
  });

  it("rejects byte-bearing facts without reading their backing", () => {
    const { facts } = prepareImageAsset(PNG);
    let touched = false;
    const invalid = {
      ...facts,
      get bytes(): Uint8Array {
        touched = true;
        throw new Error("Byte access");
      },
    };
    expect(() => imageAssetFactsSchema.parse(invalid)).toThrow();
    expect(touched).toBe(false);
  });
});
