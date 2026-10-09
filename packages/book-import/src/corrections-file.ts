import { access, readFile, writeFile } from "node:fs/promises";
import { stringify } from "yaml";
import { parseCorrections, type Corrections } from "./import-books";

/** A manifest's corrections sit beside it: freud.yaml, freud-corrections.yaml. */
export function correctionsPathOf(manifestPath: string): string {
  return manifestPath.replace(/\.ya?ml$/u, "-corrections.yaml");
}

export async function readCorrectionsBeside(
  manifestPath: string,
): Promise<Corrections> {
  const path = correctionsPathOf(manifestPath);
  try {
    await access(path);
  } catch {
    // A manifest without corrections imports its text as read.
    return {};
  }
  return parseCorrections(await readFile(path, "utf8"));
}

/** Write corrections by volume, in page order, for review in a diff. */
export async function writeCorrectionsBeside(
  manifestPath: string,
  corrections: Corrections,
): Promise<void> {
  const sorted = Object.fromEntries(
    Object.keys(corrections)
      .sort()
      .map((item) => [
        item,
        [...(corrections[item] ?? [])].sort(
          (a, b) =>
            Number(a.page) - Number(b.page) || a.from.localeCompare(b.from),
        ),
      ]),
  );
  await writeFile(
    correctionsPathOf(manifestPath),
    stringify(sorted, { lineWidth: 0 }),
  );
}
