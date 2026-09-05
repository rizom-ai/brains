import { runProcess } from "@brains/utils/run-process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import type { Logger } from "@brains/utils/logger";

export interface ContentRemoteBootstrapOptions {
  gitUrl?: string | undefined;
  branch?: string | undefined;
  seedContentPath?: string | undefined;
  bootstrapFromSeed?: boolean | undefined;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
  logger: Logger;
}

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runProcess(["git", ...args], { cwd });
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(stderr || stdout || `git ${args.join(" ")} failed`);
  }
}

function isLocalFileGitUrl(gitUrl: string): boolean {
  return gitUrl.startsWith("file://");
}

function localPathFromFileGitUrl(gitUrl: string): string {
  return fileURLToPath(gitUrl);
}

async function remoteHasBranch(
  remotePath: string,
  branch: string,
): Promise<boolean> {
  const result = await runProcess([
    "git",
    "--git-dir",
    remotePath,
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  return result.exitCode === 0;
}

export async function bootstrapContentRemoteFromSeed(
  options: ContentRemoteBootstrapOptions,
): Promise<void> {
  if (!options.bootstrapFromSeed) return;

  if (!options.gitUrl || !isLocalFileGitUrl(options.gitUrl)) return;

  if (!options.seedContentPath) {
    throw new Error(
      "directory-sync git.bootstrapFromSeed requires seedContentPath for local file:// remotes",
    );
  }

  const branch = options.branch ?? "main";
  const remotePath = localPathFromFileGitUrl(options.gitUrl);
  const seedPath = resolve(options.seedContentPath);

  if (!existsSync(seedPath)) {
    throw new Error(`Seed content path not found: ${seedPath}`);
  }

  if (!existsSync(remotePath)) {
    options.logger.debug("Creating local bare content remote", {
      remotePath,
      branch,
    });
    mkdirSync(remotePath, { recursive: true });
    await git(process.cwd(), [
      "init",
      "--bare",
      `--initial-branch=${branch}`,
      remotePath,
    ]);
  }

  if (await remoteHasBranch(remotePath, branch)) {
    options.logger.debug("Content remote already initialized", {
      remotePath,
      branch,
    });
    return;
  }

  options.logger.debug("Seeding local content remote", {
    remotePath,
    seedPath,
    branch,
  });

  const worktree = mkdtempSync(join(tmpdir(), "directory-sync-seed-"));

  try {
    await git(worktree, ["init", `--initial-branch=${branch}`]);
    await git(worktree, ["config", "user.name", options.authorName ?? "Brain"]);
    await git(worktree, [
      "config",
      "user.email",
      options.authorEmail ?? "brain@localhost",
    ]);
    // The seed dir may itself be a git checkout (e.g. a local clone of a
    // content repo) — its .git must not clobber the temp worktree's repo.
    cpSync(seedPath, worktree, {
      recursive: true,
      filter: (source) => !source.split("/").includes(".git"),
    });
    await git(worktree, ["add", "."]);
    await git(worktree, ["commit", "-m", "seed content remote"]);
    await git(worktree, ["remote", "add", "origin", options.gitUrl]);
    await git(worktree, ["push", "-u", "origin", branch]);
  } finally {
    rmSync(worktree, { recursive: true, force: true });
  }
}
