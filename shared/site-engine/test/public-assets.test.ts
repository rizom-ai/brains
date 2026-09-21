import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  truncate,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type {
  EntityFileAssets,
  EntityFileProductionOptions,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import {
  withPublicAssetSnapshot,
  type PublicAssetStageWriter,
} from "../src/public-assets";
import { MAX_PUBLIC_ASSET_SNAPSHOT_BYTES } from "../src/public-asset-contract";
import { fingerprintSiteFile } from "../src/site-file-fingerprint";
import { createImageFileActors } from "./helpers/image-file-actors";

describe("owned public asset snapshots", () => {
  let directory: string;
  let publicDir: string;
  let output: string;
  let runtime: EntityFileAssets;
  let snapshotFile: string | undefined;
  let copyGate: (() => Promise<void>) | undefined;
  let providers: Pick<EntityFileAssets, "withProducedFile">;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "public-asset-test-"));
    publicDir = join(directory, "public");
    output = join(directory, "unpublished-generation");
    await mkdir(publicDir);
    await mkdir(output);
    runtime = createImageFileActors();
    snapshotFile = undefined;
    copyGate = undefined;
    providers = {
      withProducedFile<T>(
        source: string | undefined,
        use: (
          file: EntityVerifiedFileSource,
          signal: AbortSignal,
        ) => Promise<T>,
        options?: EntityFileProductionOptions,
      ): Promise<T> {
        assert.ok(runtime.withProducedFile);
        return runtime.withProducedFile(
          source,
          async (file, signal): Promise<T> => {
            if (options?.metadata?.["mode"] === "snapshot")
              snapshotFile = file.sourceFile;
            if (options?.metadata?.["mode"] === "copy") await copyGate?.();
            return use(file, signal);
          },
          options,
        );
      },
    };
  });
  afterEach(async () => {
    await runtime.close();
    await rm(directory, { recursive: true });
  });

  test("captures independent files, copies every byte, and retires the loan only after use", async () => {
    const bytes = new Uint8Array(64 * 1024 + 3).fill(91);
    await mkdir(join(publicDir, "nested"));
    await writeFile(join(publicDir, "nested", "data.bin"), bytes);
    await writeFile(join(publicDir, "empty"), "");
    let escaped: PublicAssetStageWriter | undefined;
    await withPublicAssetSnapshot(
      publicDir,
      providers,
      async (snapshot, signal): Promise<void> => {
        expect(snapshot.files["nested/data.bin"]).toEqual({
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
        expect(Object.isFrozen(snapshot.files)).toBe(true);
        escaped = snapshot.copyToStage;
        await rm(publicDir, { recursive: true });
        await snapshot.copyToStage(output, signal);
        expect(
          new Uint8Array(await readFile(join(output, "nested", "data.bin"))),
        ).toEqual(bytes);
        expect((await readFile(join(output, "empty"))).length).toBe(0);
        assert.ok(snapshotFile);
        expect((await readFile(snapshotFile)).length).toBeGreaterThan(0);
      },
    );
    assert.ok(snapshotFile);
    assert.ok(escaped);
    await assert.rejects(readFile(snapshotFile), { code: "ENOENT" });
    await assert.rejects(
      escaped(output, new AbortController().signal),
      /closed or already entered/,
    );
  });

  test("joins an unawaited copy and rejects a second entry", async () => {
    await writeFile(join(publicDir, "file"), "captured");
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    copyGate = async (): Promise<void> => {
      entered.resolve();
      await release.promise;
    };
    let settled = false;
    const work = withPublicAssetSnapshot(
      publicDir,
      providers,
      async (snapshot, signal): Promise<number> => {
        void snapshot.copyToStage(output, signal);
        await assert.rejects(
          snapshot.copyToStage(output, signal),
          /already entered/,
        );
        return 42;
      },
    ).then((value) => {
      settled = true;
      return value;
    });
    await entered.promise;
    expect(settled).toBe(false);
    assert.ok(snapshotFile);
    expect((await readFile(snapshotFile)).length).toBeGreaterThan(0);
    release.resolve();
    expect(await work).toBe(42);
    await assert.rejects(readFile(snapshotFile), { code: "ENOENT" });
  });

  test("preserves distinct consumer and pending-copy failures", async () => {
    await writeFile(join(publicDir, "file"), "captured");
    const primary = new Error("consumer failed");
    const secondary = new Error("copy retirement failed");
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    copyGate = async (): Promise<void> => {
      entered.resolve();
      await release.promise;
      throw secondary;
    };
    const work = withPublicAssetSnapshot(
      publicDir,
      providers,
      async (snapshot, signal): Promise<void> => {
        void snapshot.copyToStage(output, signal);
        await entered.promise;
        throw primary;
      },
    );
    const checked = assert.rejects(work, (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primary, secondary]);
      return true;
    });
    await entered.promise;
    release.resolve();
    await checked;
    assert.ok(snapshotFile);
    expect((await readFile(snapshotFile)).length).toBeGreaterThan(0);
  });

  test("runtime close joins the consumer before releasing the captured files", async () => {
    await writeFile(join(publicDir, "file"), "captured");
    const entered = Promise.withResolvers<AbortSignal>();
    const release = Promise.withResolvers<void>();
    const work = withPublicAssetSnapshot(
      publicDir,
      providers,
      async (_snapshot, signal): Promise<number> => {
        entered.resolve(signal);
        await release.promise;
        return 42;
      },
    );
    const signal = await entered.promise;
    let closed = false;
    const closing = runtime.close().then(() => {
      closed = true;
    });
    expect(signal.aborted).toBe(true);
    expect(closed).toBe(false);
    assert.ok(snapshotFile);
    expect((await readFile(snapshotFile)).length).toBeGreaterThan(0);
    release.resolve();
    expect(await work).toBe(42);
    await closing;
    await assert.rejects(readFile(snapshotFile), { code: "ENOENT" });
  });

  test("re-verifies captured bytes and retains a failed snapshot", async () => {
    await writeFile(join(publicDir, "file"), "before");
    await assert.rejects(
      withPublicAssetSnapshot(
        publicDir,
        providers,
        async (snapshot, signal): Promise<void> => {
          assert.ok(snapshotFile);
          await writeFile(
            join(dirname(snapshotFile), "files", "file"),
            "change",
          );
          await snapshot.copyToStage(output, signal);
        },
      ),
      /snapshot digest mismatch/,
    );
    assert.ok(snapshotFile);
    expect((await readFile(snapshotFile)).length).toBeGreaterThan(0);
    await assert.rejects(readFile(join(output, "file")), { code: "ENOENT" });
  });

  test("preserves unpublished override precedence without following final symlinks", async () => {
    await writeFile(join(publicDir, "file"), "public override");
    const outside = join(directory, "outside");
    await writeFile(outside, "untouched");
    await symlink(outside, join(output, "file"));
    await withPublicAssetSnapshot(
      publicDir,
      providers,
      async (snapshot, signal): Promise<void> => {
        await snapshot.copyToStage(output, signal);
      },
    );
    expect(await readFile(join(output, "file"), "utf8")).toBe(
      "public override",
    );
    expect(await readFile(outside, "utf8")).toBe("untouched");
  });

  test("rejects source and staging directory symlinks", async () => {
    const outside = join(directory, "outside");
    await mkdir(outside);
    await symlink(outside, join(publicDir, "linked"));
    await assert.rejects(
      withPublicAssetSnapshot(publicDir, providers, async (): Promise<void> => {
        throw new Error("Must not enter");
      }),
      /symbolic link/,
    );
    await rm(join(publicDir, "linked"));
    await mkdir(join(publicDir, "nested"));
    await writeFile(join(publicDir, "nested", "file"), "source");
    await symlink(outside, join(output, "nested"));
    await assert.rejects(
      withPublicAssetSnapshot(
        publicDir,
        providers,
        async (snapshot, signal): Promise<void> => {
          await snapshot.copyToStage(output, signal);
        },
      ),
      /cannot traverse/,
    );
    await assert.rejects(readFile(join(outside, "file")), { code: "ENOENT" });
  });

  test("bounds the aggregate bytes without a controller buffer fallback", async () => {
    await writeFile(join(publicDir, "a"), new Uint8Array(600));
    await writeFile(join(publicDir, "b"), new Uint8Array(600));
    await assert.rejects(
      withPublicAssetSnapshot(
        publicDir,
        providers,
        async (): Promise<void> => {
          throw new Error("Must not enter");
        },
        { maxTotalBytes: 1024 },
      ),
      /1024 byte snapshot budget/,
    );
    expect(MAX_PUBLIC_ASSET_SNAPSHOT_BYTES).toBe(64 * 1024 * 1024);
    await assert.rejects(
      withPublicAssetSnapshot(publicDir, undefined, async (): Promise<void> => {
        throw new Error("Must not enter");
      }),
      /not provisioned/,
    );
  });

  test("fingerprints arbitrary staged binary artifacts without loading them in the controller", async () => {
    const bytes = new Uint8Array(96 * 1024 + 7).fill(77);
    const sourceFile = join(output, "subscriber-output.bin");
    await writeFile(sourceFile, bytes);
    expect(
      await fingerprintSiteFile(runtime, {
        sourceFile,
        sizeBytes: bytes.length,
      }),
    ).toEqual({
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    await assert.rejects(
      fingerprintSiteFile(runtime, { sourceFile, sizeBytes: bytes.length - 1 }),
    );
    await assert.rejects(
      fingerprintSiteFile(undefined, { sourceFile, sizeBytes: bytes.length }),
      /not provisioned/,
    );
  });

  test("final artifact hashing retains the exact 100 MiB ceiling", async () => {
    const sourceFile = join(output, "large-artifact.bin");
    const sizeBytes = 100 * 1024 * 1024;
    await writeFile(sourceFile, "");
    await truncate(sourceFile, sizeBytes);
    const hash = createHash("sha256");
    const fixtureCredit = new Uint8Array(32 * 1024);
    for (let offset = 0; offset < sizeBytes; offset += fixtureCredit.length)
      hash.update(fixtureCredit);
    expect(
      await fingerprintSiteFile(runtime, { sourceFile, sizeBytes }),
    ).toEqual({ sizeBytes, sha256: hash.digest("hex") });
    await assert.rejects(
      fingerprintSiteFile(runtime, { sourceFile, sizeBytes: sizeBytes + 1 }),
    );
  });

  test("missing directories need no actor; pre-abort prevents entry", async () => {
    expect(
      await withPublicAssetSnapshot(
        join(directory, "missing"),
        undefined,
        async (snapshot) => Object.keys(snapshot.files),
      ),
    ).toEqual([]);
    const caller = new AbortController();
    const reason = new Error("cancel before capture");
    caller.abort(reason);
    await assert.rejects(
      withPublicAssetSnapshot(
        publicDir,
        providers,
        async (): Promise<void> => {
          throw new Error("Must not enter");
        },
        { signal: caller.signal },
      ),
      (error: unknown) => error === reason,
    );
  });
});
