import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { onboardUser } from "../src/onboard-user";

async function createPilotRepo(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-content-repo-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    ...(cwd ? { cwd } : {}),
    encoding: "utf8",
  }).trim();
}

async function createBareRemote(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-content-remote-"));
  const remotePath = join(root, "remote.git");
  runGit(["init", "--bare", remotePath]);
  return remotePath;
}

async function populateRemote(
  remotePath: string,
  files: Record<string, string>,
): Promise<void> {
  const worktree = await mkdtemp(
    join(tmpdir(), "brains-ops-content-worktree-"),
  );
  runGit(["clone", remotePath, worktree]);
  runGit(["config", "user.name", "Test User"], worktree);
  runGit(["config", "user.email", "test@example.com"], worktree);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(worktree, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  runGit(["add", "."], worktree);
  runGit(["commit", "-m", "seed"], worktree);
  runGit(["push", "origin", "HEAD:main"], worktree);
}

function readRemoteFile(remotePath: string, filePath: string): string {
  return execFileSync(
    "git",
    ["--git-dir", remotePath, "show", `main:${filePath}`],
    { encoding: "utf8" },
  );
}

const placeholderAnchorProfile = `---
kind: professional
name: Your Name Here
description: Replace this with something that actually describes you.
---

(Delete this and write your own. Rover won't judge.)
`;

const baseFiles = {
  "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.11
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
`,
  "users/alice.yaml": `handle: alice
discord:
  enabled: false
anchorProfile:
  name: Alice Example
  description: Product strategist and systems thinker.
  website: https://alice.example
  story: |
    Alice uses Rover to collect ideas, links, and research notes.
`,
  "cohorts/canary.yaml": `members:
  - alice
`,
} satisfies Record<string, string>;

describe("content repo seeding", () => {
  it("seeds a generated anchor profile into an empty content repo", async () => {
    const root = await createPilotRepo(baseFiles);
    const remotePath = await createBareRemote();

    await onboardUser(root, "alice", undefined, {
      env: {
        ...process.env,
        GIT_SYNC_TOKEN: "test-token",
      },
      contentRepoRemoteResolver: () => remotePath,
    });

    const content = readRemoteFile(
      remotePath,
      "anchor-profile/anchor-profile.md",
    );
    expect(content).toContain("kind: professional");
    expect(content).toContain("name: Alice Example");
    expect(content).toContain(
      "description: Product strategist and systems thinker.",
    );
    expect(content).toContain("website: https://alice.example");
    expect(content).toContain(
      "Alice uses Rover to collect ideas, links, and research notes.",
    );
  });

  it("replaces stale placeholder anchor profile content", async () => {
    const root = await createPilotRepo(baseFiles);
    const remotePath = await createBareRemote();
    await populateRemote(remotePath, {
      "anchor-profile/anchor-profile.md": placeholderAnchorProfile,
    });

    await onboardUser(root, "alice", undefined, {
      env: {
        ...process.env,
        GIT_SYNC_TOKEN: "test-token",
      },
      contentRepoRemoteResolver: () => remotePath,
    });

    const content = readRemoteFile(
      remotePath,
      "anchor-profile/anchor-profile.md",
    );
    expect(content).toContain("name: Alice Example");
    expect(content).not.toContain("Your Name Here");
    expect(content).not.toContain("Delete this and write your own");
  });

  it("preserves an existing human-edited anchor profile", async () => {
    const root = await createPilotRepo(baseFiles);
    const remotePath = await createBareRemote();
    await populateRemote(remotePath, {
      "anchor-profile/anchor-profile.md": `---
kind: professional
name: Alice Real
description: Custom profile from content repo.
---

Human-edited story stays.
`,
    });

    await onboardUser(root, "alice", undefined, {
      env: {
        ...process.env,
        GIT_SYNC_TOKEN: "test-token",
      },
      contentRepoRemoteResolver: () => remotePath,
    });

    const content = readRemoteFile(
      remotePath,
      "anchor-profile/anchor-profile.md",
    );
    expect(content).toContain("name: Alice Real");
    expect(content).toContain("Human-edited story stays.");
    expect(content).not.toContain("Alice Example");
  });
});
