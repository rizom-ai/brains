import { describe, expect, it } from "bun:test";
import { computeAssetDigest } from "@brains/entity-service";
import { classifyInlineImage } from "../src";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const pngDataUrl = `data:image/png;base64,${PNG.toString("base64")}`;

describe("classifyInlineImage", () => {
  it("describes a supported image from its decoded bytes", () => {
    expect(classifyInlineImage(pngDataUrl)).toEqual({
      status: "ready",
      digest: computeAssetDigest(PNG),
      sizeBytes: PNG.byteLength,
      format: "png",
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
  });

  it("trusts the bytes over the declared media type", () => {
    const mislabelled = `data:image/jpeg;base64,${PNG.toString("base64")}`;

    expect(classifyInlineImage(mislabelled)).toMatchObject({
      status: "ready",
      mediaType: "image/png",
    });
  });

  it("tolerates whitespace around and inside the payload", () => {
    const wrapped = `data:image/png;base64,${PNG.toString("base64").replace(/(.{20})/g, "$1\n")}\n`;

    expect(classifyInlineImage(wrapped)).toMatchObject({ status: "ready" });
  });

  it("blocks SVG images", () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`;

    expect(classifyInlineImage(svg)).toEqual({
      status: "blocked",
      reason: "svg",
    });
  });

  it("blocks content that is not a base64 image data URL", () => {
    expect(classifyInlineImage("# not an image")).toEqual({
      status: "blocked",
      reason: "malformed",
    });
    expect(classifyInlineImage("data:image/png;base64,@@@@")).toEqual({
      status: "blocked",
      reason: "malformed",
    });
  });

  it("names images whose payload is a re-encoded copy of a whole data URL", () => {
    // What decoding a full data URL as base64 and re-encoding it stores.
    const reencoded = Buffer.from(pngDataUrl, "base64").toString("base64");

    expect(classifyInlineImage(`data:image/png;base64,${reencoded}`)).toEqual({
      status: "blocked",
      reason: "double-encoded",
    });
  });

  it("blocks bytes that are not a PNG, JPEG, GIF or WebP", () => {
    const bitmap = `data:image/bmp;base64,${Buffer.from("BM not supported").toString("base64")}`;

    expect(classifyInlineImage(bitmap)).toEqual({
      status: "blocked",
      reason: "unsupported",
    });
  });

  it("blocks images above the write cap", () => {
    expect(classifyInlineImage(pngDataUrl, PNG.byteLength - 1)).toEqual({
      status: "blocked",
      reason: "oversized",
      sizeBytes: PNG.byteLength,
    });
  });
});
