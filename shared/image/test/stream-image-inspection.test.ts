import { expect, test } from "bun:test";
import { StreamImageInspection } from "../src/stream-image-inspection";

test("image inspection spans credited chunks and skips large JPEG metadata without retaining it", () => {
  const parser = new StreamImageInspection();
  const prefix = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
  parser.observe(prefix);
  const data = new Uint8Array(32768);
  parser.observe(data);
  parser.observe(data.subarray(0, 32765));
  const frame = Uint8Array.from([0xff, 0xc0, 0, 8, 8, 0, 7, 0, 9, 1]);
  for (const byte of frame) parser.observe(Uint8Array.of(byte));
  expect(parser.finish()).toMatchObject({
    format: "jpeg",
    mediaType: "image/jpeg",
    width: 9,
    height: 7,
  });
});
test("PNG inspection derives dimensions without whole file backing", () => {
  const parser = new StreamImageInspection();
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
    "base64",
  );
  for (const byte of bytes) parser.observe(Uint8Array.of(byte));
  expect(parser.finish()).toMatchObject({ format: "png", width: 1, height: 1 });
});
test("GIF and extended WebP dimensions span borrowed chunks", () => {
  const gif = Buffer.from([71, 73, 70, 56, 57, 97, 2, 0, 3, 0]);
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0);
  webp.write("WEBPVP8X", 8);
  webp[24] = 1;
  webp[27] = 2;
  for (const [bytes, format] of [
    [gif, "gif"],
    [webp, "webp"],
  ] as const) {
    const inspector = new StreamImageInspection();
    for (const byte of bytes) inspector.observe(Uint8Array.of(byte));
    expect(inspector.finish()).toMatchObject({
      format,
      width: 2,
      height: 3,
      sizeBytes: bytes.length,
    });
  }
});

test("invalid and truncated image headers reject", () => {
  expect(() => new StreamImageInspection().finish()).toThrow();
  const parser = new StreamImageInspection();
  parser.observe(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 8]));
  expect(() => parser.finish()).toThrow();
});
