import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { bookPaths, type BookFile } from "./render-book";

/**
 * Replace one book and its sections under brain-data with its rendered files.
 * Sections the book no longer has disappear; other books are untouched.
 */
export async function writeBook(
  brainData: string,
  bookSlug: string,
  files: BookFile[],
): Promise<void> {
  const paths = bookPaths(bookSlug);
  const stray = files.find(
    (file) =>
      file.path !== paths.book && !file.path.startsWith(`${paths.sections}/`),
  );
  if (stray) {
    throw new Error(
      `${stray.path} is outside ${paths.book} and ${paths.sections}`,
    );
  }

  await rm(join(brainData, paths.sections), { recursive: true, force: true });
  await Promise.all(
    files.map(async (file) => {
      const target = join(brainData, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.markdown);
    }),
  );
}
