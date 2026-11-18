import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { writeFileAtomic } from "../atomic-write";
import { pullConflictSchema, type PullConflict } from "../../types/results";

/**
 * Remote texts a pull did not take, kept beside the checkout's git state
 * until whoever asked for the pull says they are recorded. A pull is never
 * replayed, so a text handed back only in its answer would be lost with it.
 */
const SPOOL = "brain-pull-conflicts";
const ID = /^[a-f0-9]{64}$/;

const spoolDir = (baseDir: string): string => join(baseDir, ".git", SPOOL);

/** Keep the remote's text of one file the merge left as the brain had it. */
export async function spoolPullConflict(
  baseDir: string,
  conflict: { path: string; text: string; remoteCommit: string },
): Promise<void> {
  const id = computeContentHash(`${conflict.remoteCommit}\n${conflict.path}`);
  const entry: PullConflict = { id, path: conflict.path, text: conflict.text };
  await mkdir(spoolDir(baseDir), { recursive: true });
  await writeFileAtomic(
    join(spoolDir(baseDir), `${id}.json`),
    JSON.stringify(entry),
  );
}

/** Every remote text not acknowledged yet, in a stable order. */
export async function listPullConflicts(
  baseDir: string,
): Promise<PullConflict[]> {
  const names = await readdir(spoolDir(baseDir)).catch(() => []);
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(async (name) =>
        pullConflictSchema.safeParse(
          z
            .string()
            .transform((raw): unknown => JSON.parse(raw))
            .parse(await readFile(join(spoolDir(baseDir), name), "utf-8")),
        ),
      ),
  );
  return entries.flatMap((entry) => (entry.success ? [entry.data] : []));
}

/** Drop the remote texts that have been recorded. */
export async function acknowledgePullConflicts(
  baseDir: string,
  ids: string[],
): Promise<void> {
  await Promise.all(
    ids
      .filter((id) => ID.test(id))
      .map((id) =>
        unlink(join(spoolDir(baseDir), `${id}.json`)).catch(() => undefined),
      ),
  );
}
