import type { FileMark } from "../engine";

/** What the file list shows beside a name; a file in step shows nothing. */
export type ExplorerMark = Exclude<FileMark, "synced"> | "refused";

/** Marks a folder passes up from what is inside it, the most pressing last. */
const PRESSING: readonly ExplorerMark[] = ["waiting", "conflict", "refused"];

function foldersOf(path: string): string[] {
  const segments = path.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

/**
 * The marks of the file list, by path: each file's own, a refused file as
 * refused, and on every folder the most pressing mark of a file inside it.
 * A file that only stays in the vault marks itself, not its folders.
 */
export function explorerMarks(
  marks: Readonly<Record<string, FileMark>>,
  refused: readonly string[],
): Record<string, ExplorerMark> {
  const refusedPaths = new Set(refused);
  const files = Object.entries(marks).flatMap(
    ([path, mark]): [string, ExplorerMark][] => {
      if (refusedPaths.has(path)) return [[path, "refused"]];
      return mark === "synced" ? [] : [[path, mark]];
    },
  );
  const folders = files.reduce((shown, [path, mark]) => {
    const rank = PRESSING.indexOf(mark);
    if (rank < 0) return shown;
    return foldersOf(path).reduce((kept, folder) => {
      const before = kept.get(folder);
      return before !== undefined && PRESSING.indexOf(before) >= rank
        ? kept
        : kept.set(folder, mark);
    }, shown);
  }, new Map<string, ExplorerMark>());
  return Object.fromEntries([...folders, ...files]);
}
