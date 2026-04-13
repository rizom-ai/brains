import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { readLocalEnvValues, resolveLocalEnvValue } from "@brains/utils";

import type { ResolvedUser } from "./load-registry";
import { runSubprocess, type RunCommand } from "./run-subprocess";
import type { ContentRepoFile } from "./user-runner";
import { deriveUserSecretNames } from "./user-secret-names";

export interface ContentRepoSyncOptions {
  env?: NodeJS.ProcessEnv | undefined;
  runCommand?: RunCommand | undefined;
  contentRepoRemoteResolver?:
    | ((
        user: ResolvedUser,
        githubOrg: string,
        token: string | undefined,
      ) => string | undefined)
    | undefined;
}

const STALE_ANCHOR_PROFILE_MARKERS = [
  "name: Your Name Here",
  "Delete this and write your own",
];

export async function syncUserContentRepo(
  rootDir: string,
  githubOrg: string,
  user: ResolvedUser,
  files: ContentRepoFile[],
  options: ContentRepoSyncOptions = {},
): Promise<void> {
  if (files.length === 0) {
    return;
  }

  const env = options.env ?? process.env;
  const localEnvValues = readLocalEnvValues(rootDir);
  const gitSyncToken = resolveGitSyncToken(user.handle, env, localEnvValues);
  const remoteUrl =
    options.contentRepoRemoteResolver?.(user, githubOrg, gitSyncToken) ??
    buildGitHubRemoteUrl(githubOrg, user.contentRepo, gitSyncToken);

  if (!remoteUrl) {
    return;
  }

  const worktree = await mkdtemp(
    join(tmpdir(), `brains-ops-content-sync-${user.handle}-`),
  );
  const runCommand = options.runCommand ?? runSubprocess;

  try {
    await runCommand("git", ["clone", remoteUrl, worktree]);
    await checkoutMainBranch(worktree, runCommand);
    await runCommand("git", ["config", "user.name", "brains-ops[bot]"], {
      cwd: worktree,
    });
    await runCommand(
      "git",
      [
        "config",
        "user.email",
        "41898282+github-actions[bot]@users.noreply.github.com",
      ],
      { cwd: worktree },
    );

    let changed = false;
    for (const file of files) {
      if (await writeContentRepoFile(worktree, file)) {
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    await runCommand("git", ["add", "."], { cwd: worktree });
    await runCommand(
      "git",
      ["commit", "-m", `chore(content): seed ${user.handle} anchor profile`],
      { cwd: worktree },
    );
    await runCommand("git", ["push", "origin", "HEAD:main"], {
      cwd: worktree,
    });
  } finally {
    await rm(worktree, { recursive: true, force: true });
  }
}

async function writeContentRepoFile(
  worktree: string,
  file: ContentRepoFile,
): Promise<boolean> {
  const filePath = join(worktree, file.path);
  const existing = await readFile(filePath, "utf8").catch(() => undefined);

  if (existing === file.content) {
    return false;
  }

  if (existing !== undefined && !isStaleAnchorProfile(existing)) {
    return false;
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, file.content);
  return true;
}

function isStaleAnchorProfile(content: string): boolean {
  return STALE_ANCHOR_PROFILE_MARKERS.some((marker) =>
    content.includes(marker),
  );
}

function resolveGitSyncToken(
  handle: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
): string | undefined {
  const secretNames = deriveUserSecretNames(handle);

  return (
    resolveLocalEnvValue(
      secretNames.gitSyncTokenSecretName,
      env,
      localEnvValues,
    ) ?? resolveLocalEnvValue("GIT_SYNC_TOKEN", env, localEnvValues)
  );
}

function buildGitHubRemoteUrl(
  githubOrg: string,
  contentRepo: string,
  gitSyncToken: string | undefined,
): string | undefined {
  if (!gitSyncToken) {
    return undefined;
  }

  return `https://x-access-token:${encodeURIComponent(gitSyncToken)}@github.com/${githubOrg}/${contentRepo}.git`;
}

async function checkoutMainBranch(
  worktree: string,
  runCommand: RunCommand,
): Promise<void> {
  try {
    await runCommand("git", ["checkout", "-B", "main", "origin/main"], {
      cwd: worktree,
    });
  } catch {
    await runCommand("git", ["checkout", "-B", "main"], {
      cwd: worktree,
    });
  }
}
