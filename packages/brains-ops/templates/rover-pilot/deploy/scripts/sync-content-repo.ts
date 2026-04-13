import { cp, mkdtemp, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { readJsonResponse, requireEnv } from "./helpers";

const handle = requireEnv("HANDLE");
const contentRepo = requireEnv("CONTENT_REPO");
const token = requireEnv("GIT_SYNC_TOKEN");
const sourceDir = join("users", handle, "content");

if (!existsSync(sourceDir)) {
  process.exit(0);
}

const { owner, repo } = parseRepoSlug(contentRepo);
await ensureGitHubRepo({ owner, repo, token });

const tempRoot = await mkdtemp(join(tmpdir(), "brains-ops-content-"));
const checkoutDir = join(tempRoot, "repo");
const remoteUrl = buildAuthenticatedRemoteUrl(owner, repo, token);

runGit(["clone", remoteUrl, checkoutDir]);
runGit(["-C", checkoutDir, "checkout", "-B", "main"]);

const copiedFiles = await copyMissingFiles(sourceDir, checkoutDir);
if (copiedFiles === 0) {
  process.exit(0);
}

runGit(["-C", checkoutDir, "config", "user.name", "brains-ops[bot]"]);
runGit([
  "-C",
  checkoutDir,
  "config",
  "user.email",
  "41898282+github-actions[bot]@users.noreply.github.com",
]);
runGit(["-C", checkoutDir, "add", "."]);

if (hasNoStagedChanges(checkoutDir)) {
  process.exit(0);
}

runGit([
  "-C",
  checkoutDir,
  "commit",
  "-m",
  `chore(content): seed ${handle} anchor profile`,
]);
runGit(["-C", checkoutDir, "push", "origin", "HEAD:main"]);

const STALE_ANCHOR_PROFILE_MARKERS = [
  "name: Your Name Here",
  "Delete this and write your own",
];

interface EnsureGitHubRepoOptions {
  owner: string;
  repo: string;
  token: string;
}

interface GitHubRepoResponse {
  clone_url?: string;
  private?: boolean;
}

async function ensureGitHubRepo(
  options: EnsureGitHubRepoOptions,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${options.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  const repoUrl = `https://api.github.com/repos/${options.owner}/${options.repo}`;
  const repoResponse = await fetch(repoUrl, { headers });

  if (repoResponse.ok) {
    await readJsonResponse(repoResponse, "GitHub repo lookup");
    return;
  }

  if (repoResponse.status !== 404) {
    const payload = await readJsonResponse(repoResponse, "GitHub repo lookup");
    throw new Error(`GitHub repo lookup failed: ${JSON.stringify(payload)}`);
  }

  const createResponse = await fetch(
    `https://api.github.com/orgs/${options.owner}/repos`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: options.repo,
        private: true,
        auto_init: false,
      }),
    },
  );
  const payload = (await readJsonResponse(
    createResponse,
    "GitHub repo create",
  )) as GitHubRepoResponse;

  if (!createResponse.ok) {
    throw new Error(`GitHub repo create failed: ${JSON.stringify(payload)}`);
  }
}

function parseRepoSlug(contentRepo: string): { owner: string; repo: string } {
  const [owner, repo] = contentRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid CONTENT_REPO: ${contentRepo}`);
  }
  return { owner, repo };
}

function buildAuthenticatedRemoteUrl(
  owner: string,
  repo: string,
  token: string,
): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`;
}

function runGit(args: string[]): void {
  execFileSync("git", args, { stdio: "inherit" });
}

function hasNoStagedChanges(checkoutDir: string): boolean {
  try {
    execFileSync("git", ["-C", checkoutDir, "diff", "--cached", "--quiet"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

async function copyMissingFiles(
  sourceDir: string,
  targetDir: string,
): Promise<number> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  let copiedFiles = 0;

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      copiedFiles += await copyMissingFiles(sourcePath, targetPath);
      continue;
    }

    const existing = await readFile(targetPath, "utf8").catch(() => undefined);
    if (existing !== undefined && !isStaleAnchorProfile(existing)) {
      continue;
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { force: true });
    copiedFiles += existing === (await readFile(sourcePath, "utf8")) ? 0 : 1;
  }

  return copiedFiles;
}

function isStaleAnchorProfile(content: string): boolean {
  return STALE_ANCHOR_PROFILE_MARKERS.some((marker) =>
    content.includes(marker),
  );
}
