import {
  createAssetRef,
  getAssetDigest,
  parseAssetRef,
  type AssetPutStreamOptions,
  type AssetRecord,
  type AssetRef,
  type AssetStat,
  type AssetStore,
  type AssetVerification,
} from "@brains/assets";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, type Stats } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export type AssetStoreErrorCode =
  | "invalid-options"
  | "not-found"
  | "not-a-file"
  | "size-mismatch"
  | "too-large"
  | "conflict";

export class AssetStoreError extends Error {
  readonly code: AssetStoreErrorCode;

  constructor(code: AssetStoreErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AssetStoreError";
    this.code = code;
  }
}

export interface FilesystemAssetStoreOptions {
  assetDirectory: string;
}

function isErrnoCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function validateByteLimit(
  name: "expectedSize" | "maxBytes",
  value: number | undefined,
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new AssetStoreError(
      "invalid-options",
      `${name} must be a non-negative safe integer`,
    );
  }
}

async function writeChunk(
  handle: FileHandle,
  chunk: Uint8Array,
): Promise<void> {
  const { bytesWritten } = await handle.write(chunk);
  if (bytesWritten !== chunk.byteLength) {
    throw new Error("Asset temporary write was incomplete");
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isErrnoCode(error, "ENOENT")) throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class FilesystemAssetStore implements AssetStore {
  private readonly assetDirectory: string;
  private readonly sha256Directory: string;
  private readonly temporaryDirectory: string;

  static createFresh(
    options: FilesystemAssetStoreOptions,
  ): FilesystemAssetStore {
    return new FilesystemAssetStore(options);
  }

  constructor(options: FilesystemAssetStoreOptions) {
    if (options.assetDirectory.trim() === "") {
      throw new AssetStoreError(
        "invalid-options",
        "assetDirectory must not be empty",
      );
    }
    this.assetDirectory = resolve(options.assetDirectory);
    this.sha256Directory = resolve(this.assetDirectory, "sha256");
    // Sibling of the digest directory, not inside it: everything under
    // `sha256/` is a digest, so scanners (reconcile, verify, GC) never have to
    // special-case a temp entry. Same filesystem, so `link()` still works.
    this.temporaryDirectory = resolve(this.assetDirectory, ".tmp");
  }

  async put(
    bytes: Uint8Array,
    options: AssetPutStreamOptions = {},
  ): Promise<AssetRecord> {
    const chunks = async function* (): AsyncGenerator<Uint8Array> {
      yield bytes;
    };
    return this.putStream(chunks(), {
      ...options,
      expectedSize: bytes.byteLength,
    });
  }

  async putStream(
    chunks: AsyncIterable<Uint8Array>,
    options: AssetPutStreamOptions = {},
  ): Promise<AssetRecord> {
    validateByteLimit("expectedSize", options.expectedSize);
    validateByteLimit("maxBytes", options.maxBytes);
    if (
      options.expectedSize !== undefined &&
      options.maxBytes !== undefined &&
      options.expectedSize > options.maxBytes
    ) {
      throw new AssetStoreError(
        "too-large",
        `Expected asset size ${options.expectedSize} exceeds limit ${options.maxBytes}`,
      );
    }

    await mkdir(this.temporaryDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = resolve(
      this.temporaryDirectory,
      `${process.pid}-${randomUUID()}.tmp`,
    );
    const handle = await open(temporaryPath, "wx", 0o600);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    let handleOpen = true;

    try {
      for await (const chunk of chunks) {
        if (!(chunk instanceof Uint8Array)) {
          throw new TypeError("Asset streams must yield Uint8Array chunks");
        }
        const nextSize = sizeBytes + chunk.byteLength;
        if (options.maxBytes !== undefined && nextSize > options.maxBytes) {
          throw new AssetStoreError(
            "too-large",
            `Asset exceeds byte limit ${options.maxBytes}`,
          );
        }
        if (
          options.expectedSize !== undefined &&
          nextSize > options.expectedSize
        ) {
          throw new AssetStoreError(
            "size-mismatch",
            `Expected ${options.expectedSize} asset bytes, received more`,
          );
        }
        await writeChunk(handle, chunk);
        hash.update(chunk);
        sizeBytes = nextSize;
      }

      if (
        options.expectedSize !== undefined &&
        sizeBytes !== options.expectedSize
      ) {
        throw new AssetStoreError(
          "size-mismatch",
          `Expected ${options.expectedSize} asset bytes, received ${sizeBytes}`,
        );
      }

      await handle.sync();
      await handle.close();
      handleOpen = false;

      const digest = hash.digest("hex");
      const verifiedDigest = await hashFile(temporaryPath);
      if (verifiedDigest !== digest) {
        throw new AssetStoreError(
          "conflict",
          "Temporary asset digest changed after write",
        );
      }

      await this.commitTemporaryFile(temporaryPath, digest, sizeBytes);
      return {
        ref: createAssetRef(digest),
        digest,
        sizeBytes,
      };
    } finally {
      if (handleOpen) await handle.close().catch(() => undefined);
      await safeUnlink(temporaryPath);
    }
  }

  async read(ref: AssetRef): Promise<Uint8Array> {
    const parsed = parseAssetRef(ref);
    const path = this.pathForRef(parsed);
    const stats = await this.requireRegularFile(path, parsed);
    const bytes = await readFile(path);
    if (bytes.byteLength !== stats.size) {
      throw new AssetStoreError(
        "size-mismatch",
        `Asset size changed while reading ${parsed}`,
      );
    }
    return bytes;
  }

  async stat(ref: AssetRef): Promise<AssetStat | null> {
    const parsed = parseAssetRef(ref);
    const path = this.pathForRef(parsed);
    const stats = await this.getRegularFile(path, parsed);
    return stats ? { ref: parsed, sizeBytes: stats.size } : null;
  }

  async verify(ref: AssetRef): Promise<AssetVerification> {
    const parsed = parseAssetRef(ref);
    const path = this.pathForRef(parsed);
    const stats = await this.requireRegularFile(path, parsed);
    const expectedDigest = getAssetDigest(parsed);
    const actualDigest = await hashFile(path);
    return {
      ref: parsed,
      sizeBytes: stats.size,
      expectedDigest,
      actualDigest,
      valid: actualDigest === expectedDigest,
    };
  }

  private pathForRef(ref: AssetRef): string {
    return resolve(this.sha256Directory, getAssetDigest(ref));
  }

  private async commitTemporaryFile(
    temporaryPath: string,
    digest: string,
    sizeBytes: number,
  ): Promise<void> {
    await mkdir(this.sha256Directory, { recursive: true, mode: 0o700 });
    const targetPath = resolve(this.sha256Directory, digest);

    try {
      await link(temporaryPath, targetPath);
      await syncDirectory(this.sha256Directory);
      return;
    } catch (error) {
      if (!isErrnoCode(error, "EEXIST")) throw error;
    }

    const existing = await this.getRegularFile(
      targetPath,
      createAssetRef(digest),
    );
    if (existing?.size !== sizeBytes) {
      throw new AssetStoreError(
        "conflict",
        `Existing asset conflicts with digest ${digest}`,
      );
    }
    const existingDigest = await hashFile(targetPath);
    if (existingDigest !== digest) {
      throw new AssetStoreError(
        "conflict",
        `Existing asset fails digest verification: ${digest}`,
      );
    }
  }

  private async getRegularFile(
    path: string,
    ref: AssetRef,
  ): Promise<Stats | null> {
    let stats: Stats;
    try {
      stats = await lstat(path);
    } catch (error) {
      if (isErrnoCode(error, "ENOENT")) return null;
      throw error;
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new AssetStoreError(
        "not-a-file",
        `Asset reference does not resolve to a regular file: ${ref}`,
      );
    }
    return stats;
  }

  private async requireRegularFile(
    path: string,
    ref: AssetRef,
  ): Promise<Stats> {
    const stats = await this.getRegularFile(path, ref);
    if (!stats) {
      throw new AssetStoreError("not-found", `Asset not found: ${ref}`);
    }
    return stats;
  }
}
