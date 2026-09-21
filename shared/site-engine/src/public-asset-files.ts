import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rename } from "node:fs/promises";
import { dirname, join, relative, isAbsolute, sep } from "node:path";
import { withFileSource } from "@brains/db/file-source";
import { withFileTarget } from "@brains/db/file-target";
import {
  fileProduceSchema,
  produceFile,
  type FileProduceInput,
} from "@brains/db/file-produce";
import { readBoundedJsonFile } from "@brains/utils/bounded-json-file";
import { isErrnoException } from "@brains/utils/predicates";
import {
  PUBLIC_ASSET_MANIFEST_BYTES,
  MAX_PUBLIC_ASSET_FILES,
  publicAssetManifestSchema,
  publicAssetPathSchema,
  publicAssetRequestSchema,
  type PublicAssetFacts,
  type PublicAssetManifest,
} from "./public-asset-contract";

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  );
}
async function stageDirectory(root: string, path: string): Promise<void> {
  let directory = root;
  for (const part of path.split("/").slice(0, -1)) {
    directory = join(directory, part);
    try {
      await mkdir(directory);
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "EEXIST") throw error;
    }
    if (!(await lstat(directory)).isDirectory())
      throw new Error(
        "Public asset stage cannot traverse a symlink or non-directory",
      );
  }
}
async function copyFile(
  source: string,
  target: string,
  sizeBytes: number,
  expected: string | undefined,
  signal?: AbortSignal,
): Promise<PublicAssetFacts> {
  return withFileTarget(
    { path: target, sizeBytes },
    async (output): Promise<PublicAssetFacts> =>
      withFileSource(
        { path: source, sizeBytes },
        async (input): Promise<PublicAssetFacts> => {
          const hash = createHash("sha256");
          const credit = new Uint8Array(32 * 1024);
          for (let offset = 0; offset < sizeBytes; offset += credit.length) {
            signal?.throwIfAborted();
            const chunk = credit.subarray(
              0,
              Math.min(credit.length, sizeBytes - offset),
            );
            await input.readInto(chunk);
            hash.update(chunk);
            await output.write(chunk);
          }
          await input.complete();
          const sha256 = hash.digest("hex");
          if (expected !== undefined && sha256 !== expected)
            throw new Error("Public asset snapshot digest mismatch");
          return { sizeBytes, sha256 };
        },
      ),
    signal,
  );
}
async function fingerprint(
  sourceFile: string,
  sizeBytes: number,
  signal?: AbortSignal,
): Promise<PublicAssetFacts> {
  return withFileSource(
    { path: sourceFile, sizeBytes },
    async (input): Promise<PublicAssetFacts> => {
      const hash = createHash("sha256");
      const credit = new Uint8Array(32 * 1024);
      for (let offset = 0; offset < sizeBytes; offset += credit.length) {
        signal?.throwIfAborted();
        const bytes = credit.subarray(
          0,
          Math.min(credit.length, sizeBytes - offset),
        );
        await input.readInto(bytes);
        hash.update(bytes);
      }
      await input.complete();
      return { sizeBytes, sha256: hash.digest("hex") };
    },
  );
}
async function capture(
  source: string,
  destination: string,
  maxTotalBytes: number,
  signal?: AbortSignal,
): Promise<PublicAssetManifest> {
  if (contains(source, destination))
    throw new Error("Public asset snapshot cannot be inside its source");
  const files: Array<[string, PublicAssetFacts]> = [];
  let total = 0;
  let visited = 0;
  async function walk(directory: string, prefix: string): Promise<void> {
    signal?.throwIfAborted();
    if (!(await lstat(directory)).isDirectory())
      throw new Error("Public asset source must be a real directory");
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (++visited > MAX_PUBLIC_ASSET_FILES * 2)
        throw new Error("Public asset tree exceeds its entry limit");
      const path = publicAssetPathSchema.parse(
        prefix ? `${prefix}/${entry.name}` : entry.name,
      );
      const input = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Public asset cannot be a symbolic link: ${path}`);
      if (entry.isDirectory()) {
        await walk(input, path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= MAX_PUBLIC_ASSET_FILES)
        throw new Error("Public assets exceed their file count limit");
      const info = await lstat(input);
      if (!info.isFile())
        throw new Error("Public asset is no longer a regular file");
      total += info.size;
      if (total > maxTotalBytes)
        throw new Error(
          `App public assets exceed the ${maxTotalBytes} byte snapshot budget at "${path}"`,
        );
      const output = join(destination, path);
      await mkdir(dirname(output), { recursive: true, mode: 0o700 });
      files.push([
        path,
        await copyFile(input, output, info.size, undefined, signal),
      ]);
    }
  }
  await walk(source, "");
  return publicAssetManifestSchema.parse({
    version: 1,
    files: Object.fromEntries(files),
  });
}

/** Actor-only capture and copying. Copy destinations MUST be the caller's
 * unpublished generation, never active output or a shared cache. Replacing
 * files there preserves existing public/static override precedence; the site
 * lifecycle, not this actor, publishes the completed generation. Snapshot
 * capture itself is exclusive/no-replace. Paths confer no authority.
 */
export async function producePublicAssets(
  input: FileProduceInput,
  signal?: AbortSignal,
): Promise<PublicAssetFacts> {
  const plan = fileProduceSchema.parse(input);
  const request = publicAssetRequestSchema.parse(plan.metadata);
  return produceFile(
    plan,
    async (): Promise<Uint8Array> => {
      let result: unknown;
      if (request.mode === "snapshot") {
        result = await capture(
          plan.sourceDirectory,
          join(dirname(plan.outputFile), "files"),
          request.maxTotalBytes,
          signal,
        );
      } else if (request.mode === "fingerprint") {
        result = await fingerprint(
          request.sourceFile,
          request.sizeBytes,
          signal,
        );
      } else {
        const root = dirname(request.snapshotFile);
        if (
          contains(root, plan.sourceDirectory) ||
          contains(plan.sourceDirectory, root)
        )
          throw new Error(
            "Public asset stage and snapshot directories must not overlap",
          );
        const manifest = publicAssetManifestSchema.parse(
          await readBoundedJsonFile(request.snapshotFile, {
            maxBytes: PUBLIC_ASSET_MANIFEST_BYTES,
            sizeBytes: request.snapshotSizeBytes,
            sha256: request.snapshotSha256,
            ...(signal && { signal }),
          }),
        );
        if (!(await lstat(plan.sourceDirectory)).isDirectory())
          throw new Error("Public asset stage must be a real directory");
        let total = 0;
        for (const [path, facts] of Object.entries(manifest.files)) {
          signal?.throwIfAborted();
          const output = join(plan.sourceDirectory, path);
          await stageDirectory(plan.sourceDirectory, path);
          // A verified exclusive candidate is renamed only inside unpublished
          // staging. Never follow an existing final-file symlink to its target.
          const candidate = join(
            dirname(output),
            `.public-asset-${randomUUID()}`,
          );
          await copyFile(
            join(root, "files", path),
            candidate,
            facts.sizeBytes,
            facts.sha256,
            signal,
          );
          signal?.throwIfAborted();
          await rename(candidate, output);
          total += facts.sizeBytes;
        }
        result = {
          sourceSha256: request.snapshotSha256,
          files: Object.keys(manifest.files).length,
          sizeBytes: total,
        };
      }
      const bytes = new TextEncoder().encode(JSON.stringify(result));
      if (bytes.length > PUBLIC_ASSET_MANIFEST_BYTES)
        throw new Error("Public asset manifest exceeds its byte limit");
      return bytes;
    },
    signal,
  );
}
