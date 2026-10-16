import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { changedPixelRatio, comparePng, solidPng } from "./png";

type Pixel = readonly [number, number, number, number];

function encode(width: number, height: number, pixels: Pixel[]): Buffer {
  const png = new PNG({ width, height });
  png.data.set(pixels.flat());
  return PNG.sync.write(png);
}

const ink: Pixel = [61, 107, 92, 255];

describe("changedPixelRatio", () => {
  it("reports no change for identical images", () => {
    const image = encode(2, 2, [ink, ink, ink, ink]);
    expect(changedPixelRatio(image, image)).toBe(0);
  });

  it("reports a full change when the dimensions differ", () => {
    expect(
      changedPixelRatio(encode(2, 1, [ink, ink]), encode(1, 2, [ink, ink])),
    ).toBe(1);
  });

  it("counts a pixel once any channel moves beyond the tolerance", () => {
    const baseline = encode(2, 2, [ink, ink, ink, ink]);
    const actual = encode(2, 2, [[74, 107, 92, 255], ink, ink, ink]);
    expect(changedPixelRatio(actual, baseline)).toBe(0.25);
  });

  it("ignores channel differences within the tolerance", () => {
    const baseline = encode(2, 2, [ink, ink, ink, ink]);
    const actual = encode(2, 2, [[73, 95, 104, 243], ink, ink, ink]);
    expect(changedPixelRatio(actual, baseline)).toBe(0);
  });

  it("counts alpha changes", () => {
    const baseline = encode(1, 2, [ink, ink]);
    const actual = encode(1, 2, [ink, [61, 107, 92, 0]]);
    expect(changedPixelRatio(actual, baseline)).toBe(0.5);
  });
});

describe("comparePng", () => {
  const directory = mkdtemp(path.join(tmpdir(), "console-visual-png-"));
  afterAll(async () => rm(await directory, { recursive: true, force: true }));

  it("compares a capture with the baseline on disk", async () => {
    const baselinePath = path.join(await directory, "baseline.png");
    await writeFile(baselinePath, encode(1, 2, [ink, ink]));
    expect(
      await comparePng(encode(1, 2, [ink, [0, 0, 0, 255]]), baselinePath),
    ).toBe(0.5);
  });

  it("rejects when the baseline is missing", async () => {
    const missing = path.join(await directory, "missing.png");
    const failure = await comparePng(encode(1, 1, [ink]), missing).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
  });
});

describe("solidPng", () => {
  it("encodes every pixel in the one color", () => {
    const image = PNG.sync.read(Buffer.from(solidPng(3, 2, ink)));
    expect([image.width, image.height]).toEqual([3, 2]);
    expect([...image.data]).toEqual(
      Array.from({ length: 6 }, () => ink).flat(),
    );
  });
});
