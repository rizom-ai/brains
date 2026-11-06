import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { FileWatcher, isIgnoredWatchPath } from "../src/lib/file-watcher";

describe("isIgnoredWatchPath", () => {
  const syncPath = "/home/user/.local/share/brain/brain-data";

  it("does not ignore the sync root or its files when an ancestor is a dot-directory", () => {
    expect(isIgnoredWatchPath(syncPath, syncPath)).toBe(false);
    expect(isIgnoredWatchPath(`${syncPath}/note.md`, syncPath)).toBe(false);
    expect(isIgnoredWatchPath(`${syncPath}/link/ref.md`, syncPath)).toBe(false);
  });

  it("ignores dotfiles and dot-directories inside the sync path", () => {
    expect(isIgnoredWatchPath(`${syncPath}/.git`, syncPath)).toBe(true);
    expect(isIgnoredWatchPath(`${syncPath}/.git/HEAD`, syncPath)).toBe(true);
    expect(isIgnoredWatchPath(`${syncPath}/.obsidian/app.md`, syncPath)).toBe(
      true,
    );
    expect(isIgnoredWatchPath(`${syncPath}/note/.draft.md`, syncPath)).toBe(
      true,
    );
  });
});

describe("FileWatcher on a real filesystem", () => {
  let root: string | undefined;
  let watcher: FileWatcher | undefined;

  afterEach(async () => {
    await watcher?.stop();
    watcher = undefined;
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it(
    "delivers adds and deletes when the sync path sits under a dot-directory",
    async () => {
      root = await mkdtemp(join(tmpdir(), "file-watcher-real-fs-"));
      const syncPath = join(root, ".brain", "brain-data");
      await mkdir(syncPath, { recursive: true });
      const batches: Array<ReadonlyMap<string, string>> = [];
      const delivered = (path: string, event: string): boolean =>
        batches.some((batch) => batch.get(path) === event);

      watcher = new FileWatcher({
        syncPath,
        watchInterval: 100,
        logger: createSilentLogger("file-watcher-real-fs"),
        onFileChanges: async (changes): Promise<void> => {
          batches.push(changes);
        },
      });
      await watcher.start();

      const notePath = join(syncPath, "note.md");
      await writeFile(notePath, "# Note\n");
      await waitUntil(() => delivered(notePath, "add"), "the add to arrive", {
        timeoutMs: 10_000,
      });

      await unlink(notePath);
      await waitUntil(
        () => delivered(notePath, "delete"),
        "the delete to arrive",
        { timeoutMs: 10_000 },
      );
    },
    { timeout: 30_000 },
  );
});
