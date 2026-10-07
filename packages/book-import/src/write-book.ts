import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BookFile } from "./render-book";

/**
 * Replace one book's directory under brain-data with its rendered files.
 * Entries the book no longer has disappear; other books are untouched.
 */
export async function writeBook(
  brainData: string,
  bookSlug: string,
  files: BookFile[],
): Promise<void> {
  const root = `book/${bookSlug}`;
  const stray = files.find((file) => !file.path.startsWith(`${root}/`));
  if (stray) {
    throw new Error(`${stray.path} is outside ${root}`);
  }

  await rm(join(brainData, root), { recursive: true, force: true });
  await Promise.all(
    files.map(async (file) => {
      const target = join(brainData, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.markdown);
    }),
  );
}
