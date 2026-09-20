import { createMockEntityService } from "@brains/entity-service/test";
import type {
  BaseEntity,
  EntityFileAssets,
  EntityVerifiedFileSource,
  EntityFileProductionOptions,
} from "@brains/entity-service";
import type { AssetRef } from "@brains/assets";
import { imageAdapter, prepareImageAsset } from "@brains/image";
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "@brains/ui-library";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { ImageBuildService } from "../src/image-build-service";
import { createTestPng } from "./helpers/test-png";
import { createImageFileActors } from "./helpers/image-file-actors";
import { createSilentLogger } from "@brains/test-utils";

describe("ImageBuildService owned files", () => {
  const logger = createSilentLogger();
  let directory: string;
  let imagesDir: string;
  let files: EntityFileAssets;
  let entities: Map<string, BaseEntity>;
  let assets: Map<AssetRef, Uint8Array>;
  let service: ReturnType<typeof createMockEntityService>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "site-image-files-"));
    imagesDir = join(directory, "images");
    await mkdir(imagesDir);
    entities = new Map();
    assets = new Map();
    files = createImageFileActors((ref) => assets.get(ref));
    service = createMockEntityService({
      getEntityImpl: async ({ id }) => entities.get(id) ?? null,
    });
    service.fileAssets = files;
    spyOn(service, "statAsset").mockImplementation(async (ref) => {
      const bytes = assets.get(ref);
      return bytes ? { ref, sizeBytes: bytes.length } : null;
    });
    spyOn(service, "readAsset").mockImplementation(async (): Promise<never> => {
      throw new Error("Controller image buffering is forbidden");
    });
  });
  afterEach(async () => {
    await files.close();
    await rm(directory, { recursive: true });
  });
  async function addImage(
    id: string,
    width: number,
    height: number,
  ): Promise<{ bytes: Uint8Array; ref: AssetRef; filename: string }> {
    const bytes = await createTestPng(width, height);
    const prepared = prepareImageAsset(bytes);
    const image = imageAdapter.createImageEntity({
      facts: prepared.facts,
      title: id,
      status: "draft",
    });
    entities.set(id, {
      ...image,
      id,
      visibility: "public",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      contentHash: "fixture",
    });
    assets.set(prepared.asset.ref, bytes);
    return {
      bytes,
      ref: prepared.asset.ref,
      filename: `${prepared.facts.digest}.${prepared.facts.format}`,
    };
  }
  function builder(): ImageBuildService {
    return new ImageBuildService(service, logger, imagesDir);
  }

  test("resolves asset references through native derivatives without controller reads", async () => {
    await addImage("cover-photo", 2000, 1000);
    const build = builder();
    await build.resolveAll(["cover-photo"], new AbortController().signal);
    expect(build.get("cover-photo")).toMatchObject({
      src: expect.stringContaining("960w.webp"),
      srcset: expect.stringContaining("1920w"),
      width: 960,
      height: 480,
    });
    expect(service.readAsset).not.toHaveBeenCalled();
  });

  test("retains a verified original for small images with no upscaled variants", async () => {
    const image = await addImage("icon", 100, 100);
    const build = builder();
    await build.resolveAll(["icon"], new AbortController().signal);
    expect(build.get("icon")).toEqual({
      src: `/images/${image.filename}`,
      width: 100,
      height: 100,
    });
    expect(
      new Uint8Array(await readFile(join(imagesDir, image.filename))),
    ).toEqual(new Uint8Array(image.bytes));
    expect(service.readAsset).not.toHaveBeenCalled();
  });

  test("inspects originals rather than trusting model MIME or dimensions", async () => {
    const image = await addImage("inspected", 100, 100);
    const entity = entities.get("inspected");
    assert.ok(entity);
    entities.set("inspected", {
      ...entity,
      metadata: {
        ...entity.metadata,
        format: "jpeg",
        mediaType: "image/jpeg",
        width: 9,
        height: 9,
      },
    });
    const build = builder();
    await build.resolveAll(["inspected"], new AbortController().signal);
    expect(build.get("inspected")).toEqual({
      src: `/images/${image.filename}`,
      width: 100,
      height: 100,
    });
  });

  test("failed inspection never publishes an original or starts optimization", async () => {
    const image = await addImage("invalid", 100, 100);
    spyOn(files, "inspect").mockRejectedValue(
      new Error("Invalid image signature"),
    );
    const download = spyOn(files, "download");
    const produce = spyOn(files, "withProducedFile");
    const build = builder();
    await build.resolveAll(["invalid"], new AbortController().signal);
    expect(build.get("invalid")).toBeUndefined();
    expect(download).not.toHaveBeenCalled();
    expect(produce).not.toHaveBeenCalled();
    await assert.rejects(readFile(join(imagesDir, image.filename)), {
      code: "ENOENT",
    });
  });

  test("changed content publishes a distinct original URL without overwriting the old file", async () => {
    const original = await addImage("icon", 100, 100);
    const build = builder();
    await build.resolveAll(["icon"], new AbortController().signal);
    const changed = await addImage("icon", 120, 120);
    await build.resolveAll(["icon"], new AbortController().signal);
    expect(changed.filename).not.toBe(original.filename);
    expect(build.get("icon")?.src).toBe(`/images/${changed.filename}`);
    expect(
      new Uint8Array(await readFile(join(imagesDir, original.filename))),
    ).toEqual(new Uint8Array(original.bytes));
    expect(
      new Uint8Array(await readFile(join(imagesDir, changed.filename))),
    ).toEqual(new Uint8Array(changed.bytes));
  });

  test("verifies existing originals rather than trusting their digest-derived names", async () => {
    const image = await addImage("icon", 100, 100);
    await builder().resolveAll(["icon"], new AbortController().signal);
    const path = join(imagesDir, image.filename);
    const corrupt = new Uint8Array(image.bytes);
    corrupt[corrupt.length - 1] = 42;
    await writeFile(path, corrupt);
    const build = builder();
    await build.resolveAll(["icon"], new AbortController().signal);
    expect(build.get("icon")).toBeUndefined();
    expect(new Uint8Array(await readFile(path))).toEqual(corrupt);
  });

  test("reuses verified originals without an overwrite attempt", async () => {
    await addImage("icon", 100, 100);
    const download = spyOn(files, "download");
    await builder().resolveAll(["icon"], new AbortController().signal);
    const fingerprint = spyOn(files, "fingerprint");
    await builder().resolveAll(["icon"], new AbortController().signal);
    expect(download).toHaveBeenCalledTimes(1);
    expect(fingerprint).toHaveBeenCalledTimes(1);
  });

  test("requires file provisioning without falling back to buffered reads", async () => {
    delete service.fileAssets;
    await assert.rejects(
      builder().resolveAll(["image"], new AbortController().signal),
      /not provisioned/,
    );
    expect(service.getEntity).not.toHaveBeenCalled();
    expect(service.readAsset).not.toHaveBeenCalled();
  });

  test("rejects pre-abort before entity reads and skips missing entities", async () => {
    const caller = new AbortController();
    const reason = new Error("cancel image preparation");
    caller.abort(reason);
    await assert.rejects(
      builder().resolveAll(["image"], caller.signal),
      (error: unknown) => error === reason,
    );
    expect(service.getEntity).not.toHaveBeenCalled();
    const build = builder();
    await build.resolveAll(["missing"], new AbortController().signal);
    expect(build.get("missing")).toBeUndefined();
  });

  test("cancellation after original publication prevents production and preserves the file", async () => {
    const image = await addImage("cancelled", 1000, 500);
    const caller = new AbortController();
    const reason = new Error("stop after original acknowledgement");
    const download = files.download.bind(files);
    spyOn(files, "download").mockImplementation(async (input, options) => {
      const receipt = await download(input, options);
      caller.abort(reason);
      return receipt;
    });
    const produce = spyOn(files, "withProducedFile");
    const build = builder();
    await assert.rejects(
      build.resolveAll(["cancelled"], caller.signal),
      (error: unknown) => error === reason,
    );
    expect(produce).not.toHaveBeenCalled();
    expect(build.get("cancelled")).toBeUndefined();
    expect(
      new Uint8Array(await readFile(join(imagesDir, image.filename))),
    ).toEqual(new Uint8Array(image.bytes));
  });

  test("serializes real producers instead of overflowing the shared bulk reservation", async () => {
    for (const width of [600, 700, 800, 900])
      await addImage(String(width), width, 100);
    const native = files.withProducedFile?.bind(files);
    assert.ok(native);
    let active = 0;
    let maximum = 0;
    files.withProducedFile = async <T>(
      source: string | undefined,
      use: (file: EntityVerifiedFileSource, signal: AbortSignal) => Promise<T>,
      options?: EntityFileProductionOptions,
    ): Promise<T> => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        return await native(source, use, options);
      } finally {
        active--;
      }
    };
    const build = builder();
    await build.resolveAll(
      ["600", "700", "800", "900"],
      new AbortController().signal,
    );
    expect(Object.keys(build.getMap())).toHaveLength(4);
    expect(
      Object.values(build.getMap()).every((image) =>
        image.src.endsWith(".webp"),
      ),
    ).toBe(true);
    expect(maximum).toBe(1);
    expect(active).toBe(0);
  });

  test("does not materialize legacy inline images as a fallback", async () => {
    const image = await addImage("inline", 100, 100);
    const entity = entities.get("inline");
    assert.ok(entity);
    entities.set("inline", {
      ...entity,
      content: `data:image/png;base64,${Buffer.from(image.bytes).toString("base64")}`,
    });
    const download = spyOn(files, "download");
    const build = builder();
    await assert.rejects(
      build.resolveAll(["inline"], new AbortController().signal),
      /require asset migration/,
    );
    expect(build.get("inline")).toBeUndefined();
    expect(download).not.toHaveBeenCalled();
    expect(service.readAsset).not.toHaveBeenCalled();
  });

  test("deduplicates IDs and exposes the complete resolved image map", async () => {
    await addImage("shared", 1000, 500);
    const build = builder();
    await build.resolveAll(
      ["shared", "shared", "shared"],
      new AbortController().signal,
    );
    expect(service.getEntity).toHaveBeenCalledTimes(1);
    expect(Object.keys(build.getMap())).toEqual(["shared"]);
  });

  test("renders entity image references with responsive source metadata", async () => {
    await addImage("photo", 2000, 1000);
    const build = builder();
    await build.resolveAll(["photo"], new AbortController().signal);
    const html = markdownToHtml("![Alt](entity://image/photo)", {
      imageRenderer: build.createImageRenderer(),
    });
    expect(html).toContain(".webp");
    expect(html).toContain("srcset=");
    expect(html).toContain('alt="Alt"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    const src = build.get("photo")?.src;
    assert.ok(src);
    expect(
      (
        await new Bun.Image(
          await readFile(join(imagesDir, basename(src))),
        ).metadata()
      ).format,
    ).toBe("webp");
  });

  test("leaves non-entity and unresolved image references to the renderer", () => {
    const imageRenderer = builder().createImageRenderer();
    expect(
      markdownToHtml("![Photo](https://example.com/img.png)", {
        imageRenderer,
      }),
    ).toContain('src="https://example.com/img.png"');
    expect(
      markdownToHtml("![Missing](entity://image/unknown)", { imageRenderer }),
    ).toContain("entity://image/unknown");
  });
});
