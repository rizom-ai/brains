import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  stat,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { spyOn } from "bun:test";
import type { App } from "@brains/app";
import type { AssetRecord } from "@brains/assets";
import {
  ImageBuildService,
  withPublicAssetSnapshot,
  fingerprintSiteFile,
} from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import { generateCanonicalAIImage } from "./turso-canonical-ai-image";

/** Candidate application's production image stage, not full site-preview or
 * installed acceptance. Each matrix case keeps the same five-second deadline.
 */
export async function prepareCanonicalSiteImage(
  app: App,
  directory: string,
  cached: boolean,
): Promise<AssetRecord> {
  const output = join(directory, "site-images");
  const record = await generateCanonicalAIImage(app, {
    width: 1200,
    height: 630,
    ...(cached && { cacheDirectory: output }),
  });
  const previous = cached
    ? await Promise.all(
        (await readdir(output)).sort().map(async (path) => ({
          path,
          mtime: (await stat(join(output, path), { bigint: true })).mtimeNs,
        })),
      )
    : [];
  const service = app.getShell().getEntityService();
  const files = service.fileAssets;
  assert.ok(files?.withProducedFile);
  const reads = spyOn(service, "readAsset").mockImplementation(
    async (): Promise<never> => {
      throw new Error("Controller site image buffering is forbidden");
    },
  );
  const production = spyOn(files, "withProducedFile");
  const download = spyOn(files, "download");
  const fingerprint = spyOn(files, "fingerprint");
  try {
    const builder = new ImageBuildService(
      service,
      createSilentLogger(),
      output,
    );
    await builder.resolveAll(
      ["actor-rendered-image"],
      new AbortController().signal,
    );
    assert.equal(reads.mock.calls.length, 0);
    assert.equal(download.mock.calls.length, cached ? 0 : 1);
    assert.equal(fingerprint.mock.calls.length, cached ? 1 : 0);
    assert.equal(production.mock.calls.length, 1);
    assert.equal(production.mock.calls[0]?.[2]?.producer, "responsive-image");
    assert.equal(builder.get("actor-rendered-image")?.width, 960);
    const original = await readFile(join(output, `${record.digest}.png`));
    assert.equal(original.length, record.sizeBytes);
    assert.equal(
      createHash("sha256").update(original).digest("hex"),
      record.digest,
    );
    for (const width of [480, 960]) {
      const actual = await readFile(
        join(output, `${record.digest.slice(0, 16)}-${width}w.webp`),
      );
      // Independent complete-byte comparison in the test, not a production fallback.
      const expected = await new Bun.Image(original)
        .resize(width, undefined, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .bytes();
      assert.deepEqual(new Uint8Array(actual), expected);
    }
    const paths = (await readdir(output)).sort();
    assert.equal(paths.length, 3);
    for (const entry of previous)
      assert.equal(
        (await stat(join(output, entry.path), { bigint: true })).mtimeNs,
        entry.mtime,
      );
    assert.equal(reads.mock.calls.length, 0);
    // Public/static binary processing on this same explicitly provisioned
    // runtime. This is a stage integration, not an installed site rebuild.
    const publicDir = join(directory, "public-fixture");
    const stage = join(directory, "public-generation");
    const bytes = new Uint8Array(64 * 1024 + 3).fill(51);
    await mkdir(publicDir);
    await mkdir(stage);
    await writeFile(join(publicDir, "file.bin"), bytes);
    await withPublicAssetSnapshot(
      publicDir,
      files,
      async (snapshot, signal): Promise<void> => {
        assert.equal(snapshot.files["file.bin"]?.sizeBytes, bytes.length);
        await rm(publicDir, { recursive: true });
        await snapshot.copyToStage(stage, signal);
        assert.deepEqual(
          new Uint8Array(await readFile(join(stage, "file.bin"))),
          bytes,
        );
      },
    );
    assert.equal(production.mock.calls.length, 3);
    assert.equal(production.mock.calls[1]?.[2]?.producer, "site-public-assets");
    assert.equal(production.mock.calls[2]?.[2]?.metadata?.["mode"], "copy");
    assert.deepEqual(
      await fingerprintSiteFile(files, {
        sourceFile: join(stage, "file.bin"),
        sizeBytes: bytes.length,
      }),
      {
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    );
    assert.equal(production.mock.calls.length, 4);
    return record;
  } finally {
    reads.mockRestore();
    production.mockRestore();
    download.mockRestore();
    fingerprint.mockRestore();
  }
}
