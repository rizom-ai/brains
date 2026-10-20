import { z } from "@brains/utils/zod";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";

const changesetIdSchema = z
  .string()
  .refine(
    (id) => id.length > 0 && id !== "." && id !== ".." && !/[\\/\0]/u.test(id),
    "Consumed changeset IDs must be file basenames",
  );
const prereleaseStateSchema = z
  .object({
    mode: z.enum(["pre", "exit"]),
    tag: z.string(),
    // Legacy state is accepted only for the owned, one-time repository data
    // transition recorded in docs/legacy-code-inventory.json.
    initialVersions: z.record(z.string(), z.string()).optional(),
    changesets: z.array(changesetIdSchema).optional(),
  })
  .strict();

interface StoredPrereleaseState {
  mode: "pre" | "exit";
  tag: string;
  initialVersions?: Record<string, string> | undefined;
  changesets?: string[] | undefined;
}

interface PrereleaseHistory {
  state: StoredPrereleaseState | undefined;
  text: string | undefined;
  pendingFiles: string[];
  consumedFiles: string[];
  legacyFiles: string[];
}

export function parsePrereleaseState(
  text: string | undefined,
): StoredPrereleaseState | undefined {
  return text === undefined
    ? undefined
    : prereleaseStateSchema.parse(JSON.parse(text));
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function markdownFiles(directory: string): Promise<string[]> {
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory())
      throw new Error(`Not a history directory: ${directory}`);
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter(
        (entry) => entry.name.endsWith(".md") && entry.name !== "README.md",
      )
      .map((entry) => {
        if (!entry.isFile())
          throw new Error(
            `Not a regular changeset: ${join(directory, entry.name)}`,
          );
        return entry.name;
      })
      .sort();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** Read-only projection: checks never invoke Changesets' mutating readPreState. */
export async function readPrereleaseHistory(
  repositoryRoot: string,
): Promise<PrereleaseHistory> {
  const directory = join(repositoryRoot, ".changeset");
  const statePath = join(directory, "pre.json");
  let text: string | undefined;
  try {
    if (!(await lstat(statePath)).isFile())
      throw new Error(`Not a regular prerelease state: ${statePath}`);
    text = await readFile(statePath, "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const state = parsePrereleaseState(text);
  const consumed = new Set(state?.changesets ?? []);
  const rootFiles = await markdownFiles(directory);
  const archived = await markdownFiles(join(directory, "pre"));
  const legacyFiles = rootFiles.filter((file) =>
    consumed.has(file.slice(0, -3)),
  );
  for (const file of legacyFiles) {
    if (archived.includes(file))
      throw new Error(`Duplicate prerelease history: ${file}`);
  }
  if (state === undefined && archived.length > 0) {
    throw new Error("Prerelease history exists without .changeset/pre.json");
  }
  return {
    state,
    text,
    pendingFiles: rootFiles.filter((file) => !consumed.has(file.slice(0, -3))),
    consumedFiles: [...legacyFiles, ...archived.map((file) => `pre/${file}`)],
    legacyFiles,
  };
}

/**
 * Move existing consumed Markdown before CLI 3 reads it as fresh work. Exclusive
 * hard-link/unlink moves cannot overwrite either an archive or a rollback target.
 * Commit pre.json last; failures restore moved files and retain the old state.
 */
export async function migratePrereleaseHistory(
  repositoryRoot: string,
): Promise<void> {
  const directory = join(repositoryRoot, ".changeset");
  const lockPath = join(directory, ".pre-migration.lock");
  const lock = await open(lockPath, "wx");
  const moved: string[] = [];
  const tempPath = join(directory, ".pre-migration.json");
  let createdArchive = false;
  let createdTemp = false;
  try {
    const history = await readPrereleaseHistory(repositoryRoot);
    const state = history.state;
    if (
      state === undefined ||
      (state.initialVersions === undefined && state.changesets === undefined)
    )
      return;
    const archive = join(directory, "pre");
    try {
      await mkdir(archive);
      createdArchive = true;
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ))
        throw error;
    }
    for (const file of history.legacyFiles) {
      await link(join(directory, file), join(archive, file));
      try {
        await unlink(join(directory, file));
      } catch (error) {
        await unlink(join(archive, file));
        throw error;
      }
      moved.push(file);
    }
    const temp = await open(tempPath, "wx");
    createdTemp = true;
    try {
      await temp.writeFile(
        JSON.stringify({ mode: state.mode, tag: state.tag }, null, 2) + "\n",
      );
    } finally {
      await temp.close();
    }
    if (
      (await readFile(join(directory, "pre.json"), "utf8")) !== history.text
    ) {
      throw new Error("Prerelease state changed during migration");
    }
    await rename(tempPath, join(directory, "pre.json"));
    createdTemp = false;
  } catch (error) {
    const failures: unknown[] = [error];
    for (const file of moved.reverse()) {
      try {
        await link(join(directory, "pre", file), join(directory, file));
        await unlink(join(directory, "pre", file));
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    }
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        "Prerelease migration rollback failed; retained history must be recovered",
        { cause: error },
      );
    throw error;
  } finally {
    try {
      if (createdTemp) await unlink(tempPath);
      if (createdArchive) {
        // Only remove an empty directory; never recursively discard history.
        await rmdir(join(directory, "pre")).catch((error: unknown) => {
          if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOTEMPTY"
          ))
            throw error;
        });
      }
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
}
