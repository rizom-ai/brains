export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type Git = (args: readonly string[]) => Promise<GitResult>;

export type VersionPush = "unchanged" | "pushed" | "merged";

/** A merge can land while a release versions main; retry a few times, then stop. */
const MERGE_ATTEMPTS = 3;

export function gitIn(
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): Git {
  return async (args) => {
    const child = Bun.spawn(["git", ...args], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
  };
}

/**
 * Commits the release's version bump and puts it on main.
 *
 * A pull request merged while the release ran moves main past the commit the
 * release versioned and verified. The version commit then joins main through a
 * merge, so main keeps the landed change and the version bump, and the release
 * keeps the version commit checked out: it publishes exactly what CI verified,
 * under a gitHead that main contains. Changesets that landed stay pending for
 * their own release. Stable graduation coordinates the site lane on main's
 * exact tip, so it never merges.
 */
export async function pushVersionCommit(options: {
  git: Git;
  message: string;
  mergeWhenMainMoved: boolean;
  log?: (line: string) => void;
}): Promise<VersionPush> {
  const { git, message, mergeWhenMainMoved } = options;
  const log = options.log ?? console.log;
  await succeed(git, ["add", "-A"]);
  const staged = await git(["diff", "--cached", "--quiet"]);
  if (staged.exitCode === 0) {
    log("No version changes to commit.");
    return "unchanged";
  }
  if (staged.exitCode !== 1) throw failure("git diff --cached", staged);
  await succeed(git, ["commit", "--quiet", "-m", message]);
  const version = await succeed(git, ["rev-parse", "HEAD"]);
  const base = await succeed(git, ["rev-parse", "HEAD^"]);
  if (await pushToMain(git, version, log)) {
    log(`Pushed version commit ${version} to main.`);
    return "pushed";
  }

  const mergeOnto = async (
    previous: string,
    attempt: number,
  ): Promise<VersionPush> => {
    const main = await fetchMain(git);
    if (main === previous)
      throw new Error(
        `Pushing to main was refused, and main has not moved from ${previous}.`,
      );
    const contained = await git(["merge-base", "--is-ancestor", base, main]);
    if (contained.exitCode === 1)
      throw new Error(
        `main (${main}) no longer contains the released commit ${base}; rerun the release on the new main.`,
      );
    if (contained.exitCode !== 0) throw failure("git merge-base", contained);
    if (!mergeWhenMainMoved)
      throw new Error(
        `main moved to ${main} during a stable release, which never merges; rerun the release on the new main.`,
      );
    if (attempt > MERGE_ATTEMPTS)
      throw new Error(
        `main kept moving while merging version commit ${version}; rerun the release.`,
      );
    const merged = await git(["merge-tree", "--write-tree", main, version]);
    if (merged.exitCode === 1)
      throw new Error(
        `Version commit ${version} conflicts with main (${main}); resolve the conflict on main and rerun the release.\n${merged.stdout}`,
      );
    if (merged.exitCode !== 0) throw failure("git merge-tree", merged);
    const tree = merged.stdout.split("\n")[0] ?? "";
    const merge = await succeed(git, [
      "commit-tree",
      tree,
      "-p",
      main,
      "-p",
      version,
      "-m",
      `Merge ${message} into main`,
    ]);
    if (!(await pushToMain(git, merge, log)))
      return mergeOnto(main, attempt + 1);
    log(
      `::notice title=Release merged into main::main moved to ${main} during this release. Merged version commit ${version} into it and publishing ${version}.`,
    );
    return "merged";
  };
  return mergeOnto(base, 1);
}

async function pushToMain(
  git: Git,
  commit: string,
  log: (line: string) => void,
): Promise<boolean> {
  const pushed = await git(["push", "origin", `${commit}:refs/heads/main`]);
  if (pushed.exitCode !== 0) log(pushed.stderr);
  return pushed.exitCode === 0;
}

async function fetchMain(git: Git): Promise<string> {
  await succeed(git, ["fetch", "--quiet", "origin", "main"]);
  return succeed(git, ["rev-parse", "FETCH_HEAD^{commit}"]);
}

async function succeed(git: Git, args: readonly string[]): Promise<string> {
  const result = await git(args);
  if (result.exitCode !== 0) throw failure(`git ${args[0]}`, result);
  return result.stdout;
}

function failure(command: string, result: GitResult): Error {
  return new Error(`${command} failed (${result.exitCode}): ${result.stderr}`);
}
