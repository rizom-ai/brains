import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import type { FileProduceInput } from "@brains/db/file-produce";
import { readBoundedJsonFile } from "@brains/utils/bounded-json-file";
import {
  responsiveImageManifestSchema,
  responsiveImageRequestSchema,
} from "../src/responsive-image-contract";
import { optimizeImageFile } from "../src/responsive-image";

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
describe("owned responsive image actor", () => {
  let directory: string;
  let images: string;
  let owner: FileProcessOwner;
  let input: FileProduceInput;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "responsive-image-"));
    images = join(directory, "images");
    await mkdir(images);
    const source = await new Bun.Image(PIXEL).resize(1000, 200).png().bytes();
    const sourceFile = join(directory, "source.png");
    await writeFile(sourceFile, source);
    input = {
      sourceDirectory: images,
      outputFile: join(directory, "manifest.json"),
      metadata: {
        sourceFile,
        sizeBytes: String(source.length),
        sha256: createHash("sha256").update(source).digest("hex"),
      },
    };
    const actor = new URL(
      "../src/responsive-image-process.ts",
      import.meta.url,
    );
    owner = new FileProcessOwner({
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      producerUrls: { "responsive-image": actor },
    });
  });
  afterEach(async () => {
    await owner.close();
    await rm(directory, { recursive: true });
  });

  test("verifies native variants and the bounded manifest after actual actor exit", async () => {
    const receipt = await owner.produce(input, undefined, "responsive-image");
    const manifest = responsiveImageManifestSchema.parse(
      await readBoundedJsonFile(input.outputFile, {
        maxBytes: 8192,
        ...receipt,
      }),
    );
    expect(manifest.variants.map((variant) => variant.width)).toEqual([
      480, 960,
    ]);
    for (const variant of manifest.variants) {
      const bytes = await readFile(join(images, variant.filename));
      expect(bytes.length).toBe(variant.sizeBytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        variant.sha256,
      );
      expect(await new Bun.Image(bytes).metadata()).toMatchObject({
        width: variant.width,
        height: variant.height,
        format: "webp",
      });
    }
    expect(owner.stats().children).toBe(0);
  });

  test("rejects a mismatched source digest before publishing any variant", async () => {
    await assert.rejects(
      owner.produce(
        { ...input, metadata: { ...input.metadata, sha256: "0".repeat(64) } },
        undefined,
        "responsive-image",
      ),
      /source digest mismatch/,
    );
    expect(await readdir(images)).toEqual([]);
    expect(
      (await readdir(directory)).some((name) => name.endsWith(".partial")),
    ).toBe(true);
    expect(owner.stats().children).toBe(0);
  });

  test("never replaces a corrupt same-name cached derivative", async () => {
    await owner.produce(input, undefined, "responsive-image");
    const manifest = responsiveImageManifestSchema.parse(
      await readBoundedJsonFile(input.outputFile, { maxBytes: 8192 }),
    );
    const variant = manifest.variants[0];
    assert.ok(variant);
    const path = join(images, variant.filename);
    const corrupt = new Uint8Array(variant.sizeBytes).fill(42);
    await writeFile(path, corrupt);
    await assert.rejects(
      owner.produce(
        { ...input, outputFile: join(directory, "second.json") },
        undefined,
        "responsive-image",
      ),
      /cache digest mismatch/,
    );
    expect(new Uint8Array(await readFile(path))).toEqual(corrupt);
    expect(owner.stats().children).toBe(0);
  });

  test("does not overwrite an existing manifest and observes pre-abort", async () => {
    await writeFile(input.outputFile, "existing");
    await assert.rejects(
      owner.produce(input, undefined, "responsive-image"),
      /exist/i,
    );
    expect(await readFile(input.outputFile, "utf8")).toBe("existing");
    const caller = new AbortController();
    const reason = new Error("cancel native image");
    caller.abort(reason);
    await assert.rejects(
      owner.produce(input, caller.signal, "responsive-image"),
      (error: unknown) => error === reason,
    );
    expect(owner.stats().children).toBe(0);
  });

  test("controller rejects oversized/mismatched manifests without a byte fallback", async () => {
    const source = responsiveImageRequestSchema.parse(input.metadata);
    await assert.rejects(
      optimizeImageFile({}, source, images),
      /not provisioned/,
    );
    const bad = {
      source: {
        sizeBytes: source.sizeBytes,
        sha256: "0".repeat(64),
        width: 100,
        height: 100,
        format: "png",
      },
      variants: [],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(bad));
    await writeFile(input.outputFile, bytes);
    const receipt = {
      sourceFile: input.outputFile,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    await assert.rejects(
      optimizeImageFile(
        {
          withProducedFile: async (_directory, use) =>
            use(receipt, new AbortController().signal),
        },
        source,
        images,
      ),
      /does not match its source receipt/,
    );
    await assert.rejects(
      optimizeImageFile(
        {
          withProducedFile: async (_directory, use) =>
            use({ ...receipt, sizeBytes: 8193 }, new AbortController().signal),
        },
        source,
        images,
      ),
      /exceeds its byte limit/,
    );
  });
});
