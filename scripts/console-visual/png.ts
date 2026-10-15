import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

/** A capture fails when more than this share of its pixels changed. */
export const CHANGED_PIXEL_THRESHOLD = 0.002;
/** Largest per-channel difference that still counts as the same pixel. */
const CHANNEL_TOLERANCE = 12;

/**
 * The share of pixels whose red, green, blue, or alpha channel moved by more
 * than the tolerance; 1 when the two images differ in size.
 */
export function changedPixelRatio(actual: Buffer, baseline: Buffer): number {
  const left = PNG.sync.read(actual);
  const right = PNG.sync.read(baseline);
  if (left.width !== right.width || left.height !== right.height) return 1;
  let changed = 0;
  const pixels = left.width * left.height;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    if (
      Math.abs(left.data.readUInt8(offset) - right.data.readUInt8(offset)) >
        CHANNEL_TOLERANCE ||
      Math.abs(
        left.data.readUInt8(offset + 1) - right.data.readUInt8(offset + 1),
      ) > CHANNEL_TOLERANCE ||
      Math.abs(
        left.data.readUInt8(offset + 2) - right.data.readUInt8(offset + 2),
      ) > CHANNEL_TOLERANCE ||
      Math.abs(
        left.data.readUInt8(offset + 3) - right.data.readUInt8(offset + 3),
      ) > CHANNEL_TOLERANCE
    )
      changed += 1;
  }
  return changed / pixels;
}

export async function comparePng(
  actual: Buffer,
  baselinePath: string,
): Promise<number> {
  return changedPixelRatio(actual, await readFile(baselinePath));
}

/** A flat, single-color PNG encoded once for deterministic fixtures. */
export function solidPng(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): Uint8Array<ArrayBuffer> {
  const png = new PNG({ width, height });
  png.data.set(Array.from({ length: width * height }, () => rgba).flat());
  // PNG.sync.write hands back a Node Buffer, whose ArrayBufferLike backing is
  // not a BodyInit. The view is the same bytes without a copy of the pixels.
  return new Uint8Array(PNG.sync.write(png));
}
