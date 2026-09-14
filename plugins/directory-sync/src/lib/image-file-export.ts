import { constants } from "node:fs";
import type { BigIntStats } from "node:fs";
import {
  link,
  lstat,
  mkdtemp,
  open,
  rename,
  rmdir,
  unlink,
  utimes,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { assetRefSchema, getAssetDigest } from "@brains/assets";
import type { EntityServiceClient } from "@brains/plugins";
type Files = NonNullable<EntityServiceClient["fileAssets"]>;
async function inspectPath(path: string): Promise<BigIntStats | undefined> {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}
function sameFile(a: BigIntStats, b: BigIntStats | undefined): boolean {
  return (
    !!b &&
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}
async function sync(path: string, directory = false): Promise<void> {
  const handle = await open(
    path,
    constants.O_RDONLY |
      constants.O_NOFOLLOW |
      (directory ? constants.O_DIRECTORY : 0),
  );
  const errors: unknown[] = [];
  try {
    await handle.sync();
  } catch (error) {
    errors.push(error);
  }
  try {
    await handle.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(errors, "Image export sync/close failed", {
      cause: errors[0],
    });
}
/** Directory-sync's explicit replacement policy, not a change to download's
 * no-replace contract. Paths are caller-trusted. Rename is atomic visibility,
 * NOT compare-and-swap against arbitrary external writers. Failed staging and
 * the prior inode link remain for recovery; published replacements are never
 * rolled back after a failed acknowledgement.
 */
export async function exportImageFile(
  files: Files,
  path: string,
  content: string,
  updated: Date,
): Promise<boolean> {
  const ref = assetRefSchema.parse(content);
  if (!Number.isFinite(updated.getTime()))
    throw new Error("Invalid image export timestamp");
  const directory = dirname(path);
  const staging = await mkdtemp(join(directory, ".turso-export-"));
  await sync(directory, true);
  const verified = join(staging, "verified");
  const previous = join(staging, "previous");
  const facts = await files.download({ ref, outputFile: verified });
  if (facts.sha256 !== getAssetDigest(ref))
    throw new Error("Image export receipt mismatch");
  const existing = await inspectPath(path);
  if (existing && !existing.isFile())
    throw new Error("Image export destination is not a regular file");
  if (existing?.size === BigInt(facts.sizeBytes)) {
    const current = await files.fingerprint({
      sourceFile: path,
      sizeBytes: facts.sizeBytes,
    });
    if (!sameFile(existing, await inspectPath(path)))
      throw new Error("Image export destination changed during comparison");
    if (
      current.sha256 === facts.sha256 &&
      current.sizeBytes === facts.sizeBytes
    ) {
      // Acknowledged, redundant private output; no public output is retracted.
      await unlink(verified);
      await rmdir(staging);
      return false;
    }
  }
  await utimes(verified, updated, updated);
  await sync(verified);
  if (existing) {
    if (!sameFile(existing, await inspectPath(path)))
      throw new Error("Image export destination changed before replacement");
    await link(path, previous);
    // link changes ctime; compare identity/size/mtime, not the pre-link ctime.
    const saved = await lstat(previous, { bigint: true });
    if (
      !saved.isFile() ||
      saved.dev !== existing.dev ||
      saved.ino !== existing.ino ||
      saved.size !== existing.size ||
      saved.mtimeNs !== existing.mtimeNs
    )
      throw new Error("Image export destination changed before preservation");
    await sync(staging, true);
    await rename(verified, path);
  } else {
    await link(verified, path); // New exports still refuse racing destinations.
  }
  await sync(staging, true);
  await sync(directory, true);
  // Only acknowledged successful exports may discard their private staging.
  if (existing) await unlink(previous);
  else await unlink(verified);
  await rmdir(staging);
  await sync(directory, true);
  return true;
}
