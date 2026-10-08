import {
  mkdir,
  mkdtemp,
  lstat,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";
import type { BookFile } from "./render-book";

export const bookSlugSchema: z.ZodString = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Unsafe book slug");

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Stage a complete book before replacing it. Requires exclusive access to the
 * output directory; this is not a concurrent-writer or crash-recovery protocol.
 * A failed rollback retains the previous book and reports its recovery path.
 */
export async function writeBook(
  brainData: string,
  bookSlug: string,
  files: BookFile[],
): Promise<void> {
  bookSlugSchema.parse(bookSlug);
  const root = `book/${bookSlug}`;
  const seen = new Set<string>();
  for (const file of files) {
    if (
      !file.path.startsWith(`${root}/`) ||
      file.path.includes("\\") ||
      Array.from(file.path).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      file.path
        .split("/")
        .some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error(`${file.path} is outside ${root} or is unsafe`);
    }
    if (seen.has(file.path))
      throw new Error(`Duplicate book path: ${file.path}`);
    seen.add(file.path);
  }
  await mkdir(brainData, { recursive: true });
  const container = join(await realpath(brainData), "book");
  await mkdir(container, { recursive: true });
  const parent = await lstat(container);
  if (!parent.isDirectory() || parent.isSymbolicLink())
    throw new Error("Unsafe book output directory");
  const staging = await mkdtemp(join(container, ".book-import-"));
  const next = join(staging, "next");
  const previous = join(staging, "previous");
  const target = join(container, bookSlug);
  const recovery = { retained: false };
  try {
    await mkdir(next);
    for (const file of files) {
      const path = join(next, file.path.slice(root.length + 1));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.markdown, { flag: "wx" });
    }
    let replaced = false;
    try {
      await rename(target, previous);
      replaced = true;
    } catch (error) {
      // A first import has no previous book; other failures must stop publication.
      if (!missing(error)) throw error;
    }
    try {
      await rename(next, target);
    } catch (error) {
      // Restore only our moved directory, never delete an intervening writer's output.
      if (replaced) {
        try {
          await rename(previous, target);
        } catch (rollbackError) {
          recovery.retained = true;
          throw new AggregateError(
            [error, rollbackError],
            `Book replacement failed; recover previous book from ${previous}`,
            { cause: rollbackError },
          );
        }
      }
      throw error;
    }
  } finally {
    if (!recovery.retained) await rm(staging, { recursive: true, force: true });
  }
}
