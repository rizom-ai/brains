import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

/** Replace one build artifact without truncating a file a reader already opened.
 * This is per-file publication, not a transaction across an entire asset set.
 */
export async function writeBuildFileAtomically(
  destination: string,
  contents: string | Uint8Array,
): Promise<void> {
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true });
  const staged = join(
    directory,
    `.${basename(destination)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(staged, contents, { flag: "wx" });
    await rename(staged, destination);
  } finally {
    await rm(staged, { force: true });
  }
}
