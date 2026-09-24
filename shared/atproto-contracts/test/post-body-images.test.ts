import { expect, test } from "bun:test";
import { getCanonicalAtprotoRecordSchema } from "../src/record-schemas";

const schema = getCanonicalAtprotoRecordSchema("ai.rizom.brain.post");
if (!schema) throw new Error("Missing post schema");
const image = {
  url: "https://pds.example/blob",
  blob: {
    $type: "blob",
    ref: { $link: "cid" },
    mimeType: "image/png",
    size: 70,
  },
};
const post = {
  $type: "ai.rizom.brain.post",
  title: "Post",
  body: "![Image](https://pds.example/blob)",
  createdAt: "2026-01-01T00:00:00Z",
};

test("body image records retain actual blob references with bounded URL mappings", () => {
  expect(schema.parse({ ...post, images: [image] })["images"]).toEqual([image]);
  for (const images of [
    [{ url: image.url }],
    [{ blob: image.blob }],
    [{ ...image, url: "invalid" }],
    [{ ...image, url: `https://pds.example/${"a".repeat(4096)}` }],
    Array.from({ length: 9 }, () => image),
  ]) {
    expect(schema.safeParse({ ...post, images }).success).toBe(false);
  }
});
