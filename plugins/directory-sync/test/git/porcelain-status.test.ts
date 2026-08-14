import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOwnedGitStatus } from "../../src/lib/owned-git";
import type { OwnedGitStatus } from "../../src/lib/owned-git";

/**
 * Porcelain parsing is the one thing directory-sync took on when it stopped
 * shelling through a library: a misparse here does not crash, it silently
 * imports or deletes the wrong files.
 *
 * Every case is driven by real `git status` output rather than a string typed
 * from memory — guessing the format is the exact risk being tested.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

async function git(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")}: ${err}`);
  return out;
}

async function repo(): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "porcelain-"));
  await git(["init", "--initial-branch=main"], scratch);
  await git(["config", "user.email", "test@example.com"], scratch);
  await git(["config", "user.name", "Test"], scratch);
  return scratch;
}

/** Exactly the command `OwnedGit.status()` issues. */
async function status(cwd: string): Promise<OwnedGitStatus> {
  return parseOwnedGitStatus(
    await git(["status", "--porcelain=v1", "--branch", "-z"], cwd),
  );
}

async function commitAll(cwd: string, message: string): Promise<void> {
  await git(["add", "-A"], cwd);
  await git(["commit", "-m", message], cwd);
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("porcelain status parsing", () => {
  it("reports a fresh repository with no commits", async () => {
    const cwd = await repo();
    const parsed = await status(cwd);

    expect(parsed.current).toBe("main");
    expect(parsed.isClean()).toBe(true);
    expect(parsed.ahead).toBe(0);
    expect(parsed.behind).toBe(0);
  });

  it("reports a clean checkout after a commit", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "a.md"), "a\n");
    await commitAll(cwd, "first");
    const parsed = await status(cwd);

    expect(parsed.current).toBe("main");
    expect(parsed.isClean()).toBe(true);
    expect(parsed.files).toEqual([]);
  });

  it("separates untracked, modified, staged, and deleted files", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "tracked.md"), "one\n");
    await writeFile(join(cwd, "removed.md"), "gone\n");
    await commitAll(cwd, "first");

    await writeFile(join(cwd, "tracked.md"), "two\n");
    await rm(join(cwd, "removed.md"));
    await writeFile(join(cwd, "added.md"), "new\n");
    await git(["add", "added.md"], cwd);
    await writeFile(join(cwd, "untracked.md"), "loose\n");

    const parsed = await status(cwd);

    expect(parsed.modified).toContain("tracked.md");
    expect(parsed.deleted).toContain("removed.md");
    expect(parsed.created).toContain("added.md");
    expect(parsed.staged).toContain("added.md");
    expect(parsed.not_added).toContain("untracked.md");
    // Untracked files are not staged, however they sort elsewhere.
    expect(parsed.staged).not.toContain("untracked.md");
    expect(parsed.isClean()).toBe(false);
  });

  it("keeps the new path of a staged rename and drops the original", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "before.md"), "same content, moved\n");
    await commitAll(cwd, "first");
    await rename(join(cwd, "before.md"), join(cwd, "after.md"));
    await git(["add", "-A"], cwd);

    const parsed = await status(cwd);

    // A rename is two NUL records: the new path, then the original. Reading
    // the original as its own entry would invent a file that does not exist.
    expect(parsed.files.map((file) => file.path)).toEqual(["after.md"]);
    expect(parsed.staged).toEqual(["after.md"]);
  });

  it("keeps paths that contain spaces and unicode intact", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "réunion été.md"), "unicode\n");
    await writeFile(join(cwd, "plain file.md"), "space\n");

    const parsed = await status(cwd);

    expect(parsed.not_added.sort()).toEqual([
      "plain file.md",
      "réunion été.md",
    ]);
  });

  it("collapses an untracked directory to the directory itself", async () => {
    const cwd = await repo();
    await mkdir(join(cwd, "my notes"), { recursive: true });
    await writeFile(join(cwd, "my notes", "réunion été.md"), "unicode\n");

    const parsed = await status(cwd);

    // Git's default: an entirely untracked directory is reported as one entry
    // rather than its contents, unless `-uall` is passed. Directory-sync only
    // reads `not_added` as "is anything untracked" (git-status.ts), and a
    // collapsed directory still answers that truthfully — so this is recorded
    // rather than worked around. Anything that needs per-file discovery must
    // not use status for it.
    expect(parsed.not_added).toEqual(["my notes/"]);
    expect(parsed.isClean()).toBe(false);
  });

  it("keeps a path containing a newline intact", async () => {
    const cwd = await repo();
    // Legal on Linux, and the reason status is read with -z at all.
    await writeFile(join(cwd, "two\nlines.md"), "newline\n");

    const parsed = await status(cwd);

    expect(parsed.not_added).toEqual(["two\nlines.md"]);
  });

  it("reports every conflicted path during a merge", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "conflict.md"), "base\n");
    await commitAll(cwd, "base");

    await git(["checkout", "-b", "other"], cwd);
    await writeFile(join(cwd, "conflict.md"), "theirs\n");
    await commitAll(cwd, "theirs");

    await git(["checkout", "main"], cwd);
    await writeFile(join(cwd, "conflict.md"), "ours\n");
    await commitAll(cwd, "ours");

    const merge = Bun.spawn(["git", "merge", "other"], {
      cwd,
      stdout: "ignore",
      stderr: "ignore",
    });
    await merge.exited;

    const parsed = await status(cwd);

    expect(parsed.conflicted).toEqual(["conflict.md"]);
    // A conflicted path is not staged work waiting to be committed.
    expect(parsed.staged).not.toContain("conflict.md");
  });

  it("reports a detached HEAD as having no branch", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "a.md"), "a\n");
    await commitAll(cwd, "first");
    const head = (await git(["rev-parse", "HEAD"], cwd)).trim();
    await git(["checkout", head], cwd);

    expect((await status(cwd)).current).toBeNull();
  });

  it("counts ahead and behind against an upstream", async () => {
    const origin = await mkdtemp(join(tmpdir(), "porcelain-origin-"));
    try {
      await git(["init", "--bare", "--initial-branch=main", "."], origin);
      const cwd = await repo();
      await writeFile(join(cwd, "a.md"), "a\n");
      await commitAll(cwd, "first");
      await git(["remote", "add", "origin", origin], cwd);
      await git(["push", "-u", "origin", "main"], cwd);

      await writeFile(join(cwd, "b.md"), "b\n");
      await commitAll(cwd, "second");
      await writeFile(join(cwd, "c.md"), "c\n");
      await commitAll(cwd, "third");

      const parsed = await status(cwd);

      expect(parsed.current).toBe("main");
      expect(parsed.ahead).toBe(2);
      expect(parsed.behind).toBe(0);
    } finally {
      await rm(origin, { recursive: true, force: true });
    }
  });

  it("reports a file staged and modified again as both", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "a.md"), "one\n");
    await commitAll(cwd, "first");
    await writeFile(join(cwd, "a.md"), "two\n");
    await git(["add", "a.md"], cwd);
    await writeFile(join(cwd, "a.md"), "three\n");

    const parsed = await status(cwd);

    // "MM": staged content plus further unstaged edits. Both facts matter —
    // committing captures the staged version, not what is on disk.
    expect(parsed.staged).toEqual(["a.md"]);
    expect(parsed.modified).toEqual(["a.md"]);
    expect(parsed.files).toHaveLength(1);
  });
});
