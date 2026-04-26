import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { readLocalEnvValues, resolveLocalEnvValue } from "@brains/utils";

import type { ResolvedUser } from "./load-registry";
import { runSubprocess, type RunCommand } from "./run-subprocess";
import type { ContentRepoFile } from "./user-runner";

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ContentRepoSyncOptions {
  env?: NodeJS.ProcessEnv | undefined;
  runCommand?: RunCommand | undefined;
  fetchImpl?: FetchImpl | undefined;
  contentRepoRemoteResolver?:
    | ((
        user: ResolvedUser,
        githubOrg: string,
        token: string | undefined,
      ) => string | undefined)
    | undefined;
  contentRepoAdminTokenSelector?: string | undefined;
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
  const gitSyncToken = resolveSecretToken(
    env,
    localEnvValues,
    user.effectiveGitSyncToken,
  );
  const contentRepoAdminToken = options.contentRepoAdminTokenSelector
    ? resolveSecretToken(
        env,
        localEnvValues,
        options.contentRepoAdminTokenSelector,
      )
    : undefined;
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
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    if (!options.contentRepoRemoteResolver) {
      if (!contentRepoAdminToken) {
        throw new Error(
          `${options.contentRepoAdminTokenSelector ?? "CONTENT_REPO_ADMIN_TOKEN"} is required to check or create content repos`,
        );
      }

      await ensureGitHubRepoExists(
        githubOrg,
        user.contentRepo,
        contentRepoAdminToken,
        fetchImpl,
      );
    }

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

function resolveSecretToken(
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
  selector: string,
): string | undefined {
  return resolveLocalEnvValue(selector, env, localEnvValues);
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

async function ensureGitHubRepoExists(
  githubOrg: string,
  contentRepo: string,
  gitSyncToken: string,
  fetchImpl: FetchImpl,
): Promise<void> {
  const repoPath = `${encodeURIComponent(githubOrg)}/${encodeURIComponent(contentRepo)}`;
  const repoUrl = `https://api.github.com/repos/${repoPath}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${gitSyncToken}`,
    "User-Agent": "brains-ops",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const repoResponse = await fetchImpl(repoUrl, { headers });
  if (repoResponse.ok) {
    return;
  }

  if (repoResponse.status !== 404) {
    throw new Error(
      `Failed to check GitHub repo ${githubOrg}/${contentRepo}: ${repoResponse.status} ${await readResponseText(repoResponse)}`,
    );
  }

  const createResponse = await fetchImpl(
    `https://api.github.com/orgs/${encodeURIComponent(githubOrg)}/repos`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: contentRepo,
        private: true,
        auto_init: false,
      }),
    },
  );

  if (createResponse.ok) {
    console.log(`Created missing content repo ${githubOrg}/${contentRepo}`);
    return;
  }

  if (createResponse.status === 422) {
    const retryResponse = await fetchImpl(repoUrl, { headers });
    if (retryResponse.ok) {
      return;
    }
  }

  throw new Error(
    `Failed to create GitHub repo ${githubOrg}/${contentRepo}: ${createResponse.status} ${await readResponseText(createResponse)}`,
  );
}

async function readResponseText(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim().length === 0 ? response.statusText : text;
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
