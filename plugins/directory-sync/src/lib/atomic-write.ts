import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Suffix of the temporary file a replace writes before renaming it into place. */
export const ATOMIC_WRITE_SUFFIX = ".brains-write";

/** Git exclude pattern for in-flight writes at any depth of the checkout. */
export const ATOMIC_WRITE_EXCLUDE_PATTERN: string = `.*${ATOMIC_WRITE_SUFFIX}`;

/** A dotfile beside the target, so the rename never crosses filesystems. */
export function atomicWriteTempPath(target: string): string {
  return join(
    dirname(target),
    `.${basename(target)}.${randomUUID()}${ATOMIC_WRITE_SUFFIX}`,
  );
}

export function isAtomicWriteTemp(path: string): boolean {
  const name = basename(path);
  return name.startsWith(".") && name.endsWith(ATOMIC_WRITE_SUFFIX);
}

/**
 * Replace a file in one step. Readers — the file watcher, the import scan,
 * Git — see the previous bytes or the new ones, never a truncated file. The
 * leading dot keeps the watcher and discovery away from the temporary file,
 * and the checkout's Git exclude keeps it out of commits.
 */
export async function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
): Promise<void> {
  const temp = atomicWriteTempPath(target);
  try {
    await writeFile(temp, data);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
