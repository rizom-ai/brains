import { createMockShell } from "../../src/test/mock-shell";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  readFile,
  stat,
  lstat,
  readdir,
  symlink,
  unlink,
} from "fs/promises";
import assert from "node:assert/strict";
import { tmpdir } from "os";
import { join } from "path";
import { createServicePluginContext } from "../../src/service/context";
import {
  RuntimeUploadRegistry,
  RuntimeUploadStoreError,
  AcknowledgedRuntimeUploadError,
  normalizeRuntimeUploadDataDir,
} from "../../src/service/upload-registry";

import { getErrorMessage } from "@brains/utils/error";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "runtime-upload-registry-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function fixedUploadId(suffix: string): string {
  return `upload-00000000-0000-4000-8000-${suffix}`;
}

function fixedNow(): Date {
  return new Date("2026-05-30T00:00:00.000Z");
}

async function expectStoreError(
  promise: Promise<unknown>,
  code: RuntimeUploadStoreError["code"],
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected upload store error");
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeUploadStoreError);
    expect(error instanceof RuntimeUploadStoreError ? error.code : null).toBe(
      code,
    );
  }
}

describe("RuntimeUploadRegistry", () => {
  function scopedStore(): ReturnType<RuntimeUploadRegistry["scoped"]> {
    return RuntimeUploadRegistry.createFresh({ dataDir }).scoped({
      namespace: "upload",
      refKind: "upload",
      routePath: "/api/chat/uploads",
      now: fixedNow,
    });
  }

  it("retains a file by inode and survives producer cleanup without buffered saving", async () => {
    const store = scopedStore();
    const sourceFile = join(dataDir, "produced");
    await writeFile(sourceFile, "file bytes");
    const original = await stat(sourceFile);
    const metadata = { source: "original" };
    const pending = store.saveFile({
      sourceFile,
      sizeBytes: 10,
      filename: "file.pdf",
      mediaType: "application/pdf",
      metadata,
    });
    metadata.source = "mutated";
    const record = await pending;
    expect(record.metadata).toEqual({ source: "original" });
    expect(await store.readRecord(record.id)).toEqual(record);
    const retained = await stat(join(store.getUploadDir(record.id), "content"));
    expect(retained.ino).toBe(original.ino);
    expect(retained.dev).toBe(original.dev);
    expect((await stat(store.getUploadDir(record.id))).mode & 0o777).toBe(
      0o700,
    );
    expect(
      (await stat(join(store.getUploadDir(record.id), "metadata.json"))).mode &
        0o777,
    ).toBe(0o600);
    await unlink(sourceFile);
    await store.withFile(
      record.id,
      async ({ sourceFile: pinned }): Promise<void> => {
        await store.remove(record.id);
        expect(await readFile(pinned, "utf8")).toBe("file bytes");
      },
    );
    expect(
      (await readdir(join(dataDir, "upload"))).filter((name) =>
        name.startsWith(".upload-save-"),
      ),
    ).toEqual([]);
  });

  it("never overwrites an existing upload and retains failed staging outside pruning", async () => {
    const store = RuntimeUploadRegistry.createFresh({ dataDir }).scoped({
      namespace: "upload",
      refKind: "upload",
      routePath: "/uploads",
      createId: () => fixedUploadId("000000000001"),
      maxCount: 1,
    });
    const sourceFile = join(dataDir, "first");
    const replacement = join(dataDir, "second");
    await writeFile(sourceFile, "first");
    await writeFile(replacement, "second");
    const record = await store.saveFile({
      sourceFile,
      sizeBytes: 5,
      filename: "first.pdf",
      mediaType: "application/pdf",
    });
    await assert.rejects(
      store.saveFile({
        sourceFile: replacement,
        sizeBytes: 6,
        filename: "second.pdf",
        mediaType: "application/pdf",
      }),
      /EEXIST/,
    );
    await assert.rejects(
      store.save({
        filename: "overwrite.pdf",
        mediaType: "application/pdf",
        content: Buffer.from("overwritten"),
      }),
      /EEXIST/,
    );
    expect(await readFile(sourceFile, "utf8")).toBe("first");
    expect(await store.readRecord(record.id)).toEqual(record);
    expect(
      await readFile(join(store.getUploadDir(record.id), "content"), "utf8"),
    ).toBe("first");
    const stages = (await readdir(join(dataDir, "upload"))).filter((name) =>
      name.startsWith(".upload-save-"),
    );
    expect(stages).toHaveLength(1);
    const stage = stages[0];
    assert.ok(stage);
    await unlink(replacement);
    await store.remove(record.id);
    await store.prune();
    expect(
      await readFile(join(dataDir, "upload", stage, "content"), "utf8"),
    ).toBe("second");
    expect(
      (await lstat(join(dataDir, "upload", stage, "metadata.json"))).isFile(),
    ).toBe(true);
  });

  it("rejects non-files, symlinks, wrong sizes and unbounded descriptors before publication", async () => {
    const store = scopedStore();
    const sourceFile = join(dataDir, "source");
    const alias = join(dataDir, "alias");
    await writeFile(sourceFile, "bytes");
    await symlink(sourceFile, alias);
    const input = {
      sourceFile,
      sizeBytes: 5,
      filename: "source.pdf",
      mediaType: "application/pdf",
    };
    for (const invalid of [
      { ...input, sourceFile: alias },
      { ...input, sourceFile: dataDir },
      { ...input, sourceFile: "relative" },
      { ...input, sizeBytes: 6 },
      { ...input, sizeBytes: 100 * 1024 * 1024 + 1 },
      { ...input, metadata: { large: "x".repeat(16384) } },
    ])
      await assert.rejects(store.saveFile(invalid));
    await assert.rejects(stat(join(dataDir, "upload")), /ENOENT/);
    expect(await readFile(sourceFile, "utf8")).toBe("bytes");
  });

  it("preserves the published record when post-publication retirement throws", async () => {
    const store = scopedStore();
    const sourceFile = join(dataDir, "source");
    await writeFile(sourceFile, "bytes");
    const failure = new Error("retirement failed before returning its promise");
    store.prune = (): Promise<void> => {
      throw failure;
    };
    let acknowledgedId = "";
    await assert.rejects(
      store.saveFile({
        sourceFile,
        sizeBytes: 5,
        filename: "source.pdf",
        mediaType: "application/pdf",
      }),
      (error: unknown) => {
        assert.ok(error instanceof AcknowledgedRuntimeUploadError);
        expect(error.cause).toBe(failure);
        acknowledgedId = error.record.id;
        return true;
      },
    );
    expect((await store.readRecord(acknowledgedId)).filename).toBe(
      "source.pdf",
    );
    expect(
      await readFile(
        join(store.getUploadDir(acknowledgedId), "content"),
        "utf8",
      ),
    ).toBe("bytes");
  });

  it("refuses even an empty pre-existing destination directory", async () => {
    const id = fixedUploadId("000000000002");
    const store = RuntimeUploadRegistry.createFresh({ dataDir }).scoped({
      namespace: "upload",
      refKind: "upload",
      routePath: "/uploads",
      createId: () => id,
    });
    const sourceFile = join(dataDir, "source");
    await writeFile(sourceFile, "bytes");
    await mkdir(store.getUploadDir(id), { recursive: true });
    const before = await stat(store.getUploadDir(id));
    await assert.rejects(
      store.saveFile({
        sourceFile,
        sizeBytes: 5,
        filename: "source.pdf",
        mediaType: "application/pdf",
      }),
      /EEXIST/,
    );
    expect((await stat(store.getUploadDir(id))).ino).toBe(before.ino);
    expect(await readdir(store.getUploadDir(id))).toEqual([]);
    await expectStoreError(store.readRecord(id), "not_found");
  });

  it("pins files outside pruning until the joined consumer returns", async () => {
    const store = scopedStore();
    const record = await store.save({
      filename: "image.png",
      mediaType: "image/png",
      content: Buffer.from("bytes"),
    });
    let pinned = "";
    const result = await store.withFile(
      record.id,
      async ({ record: metadata, sourceFile }): Promise<string> => {
        pinned = sourceFile;
        expect(metadata).toEqual(record);
        await store.remove(record.id);
        await store.prune();
        expect(await readFile(sourceFile, "utf8")).toBe("bytes");
        return "joined";
      },
    );
    expect(result).toBe("joined");
    await assert.rejects(stat(pinned), /ENOENT/);
  });

  it("retains failed consumer pins for recovery", async () => {
    const store = scopedStore();
    const record = await store.save({
      filename: "image.png",
      mediaType: "image/png",
      content: Buffer.from("bytes"),
    });
    const primary = new Error("unconfirmed consumer completion");
    let pinned = "";
    await assert.rejects(
      store.withFile(record.id, async ({ sourceFile }): Promise<never> => {
        pinned = sourceFile;
        throw primary;
      }),
      (error: unknown) => error === primary,
    );
    await store.remove(record.id);
    await store.prune();
    expect(await readFile(pinned, "utf8")).toBe("bytes");
  });

  it("rejects mismatched file metadata before entering the consumer", async () => {
    const store = scopedStore();
    const record = await store.save({
      filename: "image.png",
      mediaType: "image/png",
      content: Buffer.from("bytes"),
    });
    await writeFile(
      join(store.getUploadDir(record.id), "content"),
      "changed length",
    );
    let entered = false;
    await assert.rejects(
      store.withFile(record.id, async (): Promise<void> => {
        entered = true;
      }),
      /does not match/,
    );
    expect(entered).toBe(false);
  });

  it("prunes quietly before the uploads directory exists", async () => {
    // Created lazily on first save, so "not there yet" is not a fault.
    const outcome = await scopedStore()
      .prune()
      .then(
        () => "quiet",
        (error: unknown) => getErrorMessage(error),
      );

    expect(outcome).toBe("quiet");
  });

  it("raises when the uploads directory cannot be read", async () => {
    // Anything other than absence means pruning did not happen. Reporting
    // nothing would let uploads accumulate unbounded with no signal.
    const uploadsRoot = join(dataDir, "upload", "uploads");
    await mkdir(join(dataDir, "upload"), { recursive: true });
    await writeFile(uploadsRoot, "not a directory");

    const outcome = await scopedStore()
      .prune()
      .then(
        () => "swallowed",
        (error: unknown) => getErrorMessage(error),
      );

    expect(outcome).not.toBe("swallowed");
  });

  it("stores scoped upload metadata and content under runtime data", async () => {
    const registry = RuntimeUploadRegistry.createFresh({ dataDir });
    const store = registry.scoped({
      namespace: "upload",
      refKind: "upload",
      routePath: "/api/chat/uploads",
      createId: (): string => fixedUploadId("000000000001"),
      now: fixedNow,
    });

    const record = await store.save({
      filename: "notes.md",
      mediaType: "text/markdown",
      content: Buffer.from("# Notes"),
      metadata: { interfaceType: "web-chat", channelId: "session-1" },
    });

    expect(record).toEqual({
      id: "upload-00000000-0000-4000-8000-000000000001",
      ref: {
        kind: "upload",
        id: "upload-00000000-0000-4000-8000-000000000001",
      },
      filename: "notes.md",
      mediaType: "text/markdown",
      sizeBytes: 7,
      createdAt: "2026-05-30T00:00:00.000Z",
      metadata: { interfaceType: "web-chat", channelId: "session-1" },
    });
    expect(
      await Bun.file(
        join(dataDir, "upload", "uploads", record.id, "content"),
      ).text(),
    ).toBe("# Notes");
    expect(store.toResponseBody(record)).toEqual({
      ...record,
      url: `/api/chat/uploads?id=${record.id}`,
      downloadUrl: `/api/chat/uploads?id=${record.id}&download=1`,
    });
  });

  it("normalizes content brain-data to sibling runtime data", async () => {
    expect(normalizeRuntimeUploadDataDir(join(dataDir, "brain-data"))).toBe(
      join(dataDir, "data"),
    );
  });

  it("rejects malformed metadata and mismatched ref kinds", async () => {
    const registry = RuntimeUploadRegistry.createFresh({ dataDir });
    const store = registry.scoped({
      namespace: "upload",
      refKind: "upload",
      routePath: "/api/chat/uploads",
    });
    const uploadId = fixedUploadId("000000000003");
    const uploadDir = join(dataDir, "upload", "uploads", uploadId);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, "content"), "hello");
    await writeFile(
      join(uploadDir, "metadata.json"),
      JSON.stringify({
        id: uploadId,
        ref: { kind: "other-upload", id: uploadId },
        filename: "notes.txt",
        mediaType: "text/plain",
        sizeBytes: 5,
        createdAt: fixedNow().toISOString(),
      }),
    );

    await expectStoreError(store.read(uploadId), "invalid_metadata");
  });

  it("exposes scoped stores through plugin context", async () => {
    const context = createServicePluginContext(
      createMockShell({ dataDir }),
      "test-plugin",
    );
    const store = context.uploads.scoped({
      namespace: "test-plugin",
      refKind: "test-upload",
      routePath: "/api/test/uploads",
      createId: (): string => fixedUploadId("000000000004"),
    });

    const record = await store.save({
      filename: "hello.txt",
      mediaType: "text/plain",
      content: Buffer.from("hello"),
    });

    expect(record.ref.kind).toBe("test-upload");
    expect(await store.read(record.id)).toMatchObject({
      record: { filename: "hello.txt" },
    });
  });
});
