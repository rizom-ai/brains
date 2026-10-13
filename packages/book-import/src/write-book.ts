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
import { bookPaths, type BookFile } from "./render-book";

export const bookSlugSchema: z.ZodString = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Unsafe book slug");
function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Stage a book and its sections before replacing either. Requires stopped
 * readers and exclusive output access: two renames are not a filesystem-wide
 * transaction or a crash/concurrent-writer recovery protocol. Failed rollback
 * retains staged files and backups and reports their recovery directory.
 */
export async function writeBook(
  brainData: string,
  bookSlug: string,
  files: BookFile[],
): Promise<void> {
  bookSlugSchema.parse(bookSlug);
  const paths = bookPaths(bookSlug);
  const seen = new Set<string>();
  for (const file of files) {
    if (
      (file.path !== paths.book &&
        !file.path.startsWith(`${paths.sections}/`)) ||
      file.path.includes("\\") ||
      Array.from(file.path).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      file.path
        .split("/")
        .some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error(
        `${file.path} is outside ${paths.book} and ${paths.sections} or is unsafe`,
      );
    }
    if (seen.has(file.path))
      throw new Error(`Duplicate book path: ${file.path}`);
    seen.add(file.path);
  }
  if (!seen.has(paths.book))
    throw new Error(`Missing book title file: ${paths.book}`);
  await mkdir(brainData, { recursive: true });
  const root = await realpath(brainData);
  for (const name of ["book", "book-section"]) {
    const container = join(root, name);
    await mkdir(container, { recursive: true });
    const parent = await lstat(container);
    if (!parent.isDirectory() || parent.isSymbolicLink())
      throw new Error("Unsafe book output directory");
  }
  const staging = await mkdtemp(join(root, ".book-import-"));
  const sections = {
    target: join(root, paths.sections),
    next: join(staging, "next-sections"),
    previous: join(staging, "previous-sections"),
    backedUp: false,
    published: false,
  };
  const book = {
    target: join(root, paths.book),
    next: join(staging, "next-book"),
    previous: join(staging, "previous-book"),
    backedUp: false,
    published: false,
  };
  const replacements = [sections, book];
  const recovery = { retained: false };
  try {
    await mkdir(sections.next);
    for (const file of files) {
      const path =
        file.path === paths.book
          ? book.next
          : join(sections.next, file.path.slice(paths.sections.length + 1));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.markdown, { flag: "wx" });
    }
    try {
      for (const entry of replacements) {
        try {
          await rename(entry.target, entry.previous);
          entry.backedUp = true;
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
      for (const entry of replacements) {
        await rename(entry.next, entry.target);
        entry.published = true;
      }
    } catch (error) {
      const failures: unknown[] = [];
      for (const entry of [...replacements].reverse()) {
        try {
          if (entry.published) await rename(entry.target, entry.next);
          if (entry.backedUp) await rename(entry.previous, entry.target);
        } catch (rollbackError) {
          failures.push(rollbackError);
        }
      }
      if (failures.length > 0) {
        recovery.retained = true;
        throw new AggregateError(
          [error, ...failures],
          `Book replacement failed; recover previous book from ${staging}`,
          { cause: error },
        );
      }
      throw error;
    }
  } finally {
    if (!recovery.retained) await rm(staging, { recursive: true, force: true });
  }
}
