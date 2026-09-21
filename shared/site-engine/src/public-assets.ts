import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  EntityFileAssets,
  EntityBinaryRequestOptions,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import { isErrnoException } from "@brains/utils/predicates";
import { readBoundedJsonFile } from "@brains/utils/bounded-json-file";
import {
  MAX_PUBLIC_ASSET_SNAPSHOT_BYTES,
  PUBLIC_ASSET_MANIFEST_BYTES,
  publicAssetManifestSchema,
  publicAssetCopyReceiptSchema,
  publicAssetRequestSchema,
  type PublicAssetMap,
} from "./public-asset-contract";

export type PublicAssetStageWriter = (
  unpublishedOutputDir: string,
  signal: AbortSignal,
) => Promise<void>;
export interface ScopedPublicAssets {
  readonly files: PublicAssetMap;
  copyToStage: PublicAssetStageWriter;
}
export interface PublicAssetSnapshotOptions extends EntityBinaryRequestOptions {
  maxTotalBytes?: number;
}
type Producers = Pick<EntityFileAssets, "withProducedFile">;

async function consume<T>(
  files: PublicAssetMap,
  write: PublicAssetStageWriter,
  use: (snapshot: ScopedPublicAssets, signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  const abort = new AbortController();
  const ownedSignal = AbortSignal.any([signal, abort.signal]);
  let open = true;
  let entered = false;
  let pending: Promise<void> | undefined;
  let result: { value: T } | undefined;
  const errors: unknown[] = [];
  const failed = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  const snapshot: ScopedPublicAssets = {
    files: Object.freeze(
      Object.fromEntries(
        Object.entries(files).map(([path, facts]) => [
          path,
          Object.freeze({ ...facts }),
        ]),
      ),
    ),
    copyToStage: (output, caller): Promise<void> => {
      if (!open || entered)
        return Promise.reject(
          new Error("Public asset writer is closed or already entered"),
        );
      entered = true;
      pending = write(output, AbortSignal.any([ownedSignal, caller]));
      // Observe immediately; the real outcome is always joined below.
      void pending.catch(() => undefined);
      return pending;
    },
  };
  try {
    result = { value: await use(snapshot, signal) };
  } catch (error) {
    failed(error);
    abort.abort(error);
  }
  open = false;
  try {
    await pending;
  } catch (error) {
    failed(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Site consumption and public asset copying failed",
      { cause: errors[0] },
    );
  if (!result) throw new Error("Public asset consumption has no outcome");
  return result.value;
}
async function copy(
  files: Producers,
  source: EntityVerifiedFileSource,
  entries: PublicAssetMap,
  output: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (!files.withProducedFile)
    throw new Error("Public asset processing is not provisioned");
  await files.withProducedFile(
    resolve(output),
    async (file, owned): Promise<void> => {
      const receipt = publicAssetCopyReceiptSchema.parse(
        await readBoundedJsonFile(file.sourceFile, {
          maxBytes: PUBLIC_ASSET_MANIFEST_BYTES,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          signal: owned,
        }),
      );
      if (
        receipt.sourceSha256 !== source.sha256 ||
        receipt.files !== Object.keys(entries).length ||
        receipt.sizeBytes !==
          Object.values(entries).reduce(
            (sum, entry) => sum + entry.sizeBytes,
            0,
          )
      )
        throw new Error(
          "Public asset copy receipt does not match its snapshot",
        );
    },
    {
      signal,
      producer: "site-public-assets",
      metadata: {
        mode: "copy",
        snapshotFile: source.sourceFile,
        snapshotSizeBytes: String(source.sizeBytes),
        snapshotSha256: source.sha256,
      },
    },
  );
}

/** Capture once in the existing producer owner; retain independently copied
 * files through rendering and site publication. Actual
 * copy bytes are verified again in the actor: private paths are not authority
 * or a promise that another same-user process cannot mutate a file.
 */
export async function withPublicAssetSnapshot<T>(
  publicDir: string,
  files: Producers | undefined,
  use: (snapshot: ScopedPublicAssets, signal: AbortSignal) => Promise<T>,
  options?: PublicAssetSnapshotOptions,
): Promise<T> {
  const request = publicAssetRequestSchema.parse({
    mode: "snapshot",
    maxTotalBytes: options?.maxTotalBytes ?? MAX_PUBLIC_ASSET_SNAPSHOT_BYTES,
  });
  if (request.mode !== "snapshot")
    throw new Error("Invalid public asset snapshot request");
  const signal = options?.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const directory = resolve(publicDir);
  try {
    if (!(await lstat(directory)).isDirectory())
      throw new Error("Public asset source must be a real directory");
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "ENOENT") throw error;
    return consume(
      {},
      async (_output, current): Promise<void> => {
        current.throwIfAborted();
      },
      use,
      signal,
    );
  }
  if (!files?.withProducedFile)
    throw new Error("Public asset processing is not provisioned");
  return files.withProducedFile(
    directory,
    async (file, owned): Promise<T> => {
      const manifest = publicAssetManifestSchema.parse(
        await readBoundedJsonFile(file.sourceFile, {
          maxBytes: PUBLIC_ASSET_MANIFEST_BYTES,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          signal: owned,
        }),
      );
      const total = Object.values(manifest.files).reduce(
        (sum, entry) => sum + entry.sizeBytes,
        0,
      );
      if (total > request.maxTotalBytes)
        throw new Error("Public asset receipt exceeds its requested limit");
      return consume(
        manifest.files,
        (output, current) => copy(files, file, manifest.files, output, current),
        use,
        owned,
      );
    },
    {
      signal,
      producer: "site-public-assets",
      metadata: {
        mode: "snapshot",
        maxTotalBytes: String(request.maxTotalBytes),
      },
    },
  );
}
