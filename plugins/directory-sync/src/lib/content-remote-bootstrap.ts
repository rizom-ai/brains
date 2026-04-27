import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import type { Logger } from "@brains/utils";

export interface ContentRemoteBootstrapOptions {
  gitUrl?: string | undefined;
  branch?: string | undefined;
  seedContentPath?: string | undefined;
  bootstrapFromSeed?: boolean | undefined;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
  logger: Logger;
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, stdio: "pipe" });
  if (result.status !== 0) {
    const stderr = result.stderr.toString().trim();
    const stdout = result.stdout.toString().trim();
    throw new Error(stderr || stdout || `git ${args.join(" ")} failed`);
  }
}

function isLocalFileGitUrl(gitUrl: string): boolean {
  return gitUrl.startsWith("file://");
}

function localPathFromFileGitUrl(gitUrl: string): string {
  return fileURLToPath(gitUrl);
}

function remoteHasBranch(remotePath: string, branch: string): boolean {
  const result = spawnSync("git", [
    "--git-dir",
    remotePath,
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  return result.status === 0;
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
    git(process.cwd(), [
      "init",
      "--bare",
      `--initial-branch=${branch}`,
      remotePath,
    ]);
  }

  if (remoteHasBranch(remotePath, branch)) {
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
    git(worktree, ["init", `--initial-branch=${branch}`]);
    git(worktree, ["config", "user.name", options.authorName ?? "Brain"]);
    git(worktree, [
      "config",
      "user.email",
      options.authorEmail ?? "brain@localhost",
    ]);
    cpSync(seedPath, worktree, { recursive: true });
    git(worktree, ["add", "."]);
    git(worktree, ["commit", "-m", "seed content remote"]);
    git(worktree, ["remote", "add", "origin", options.gitUrl]);
    git(worktree, ["push", "-u", "origin", branch]);
  } finally {
    rmSync(worktree, { recursive: true, force: true });
  }
}
