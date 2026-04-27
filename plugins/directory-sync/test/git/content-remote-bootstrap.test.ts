import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSilentLogger } from "@brains/test-utils";
import { bootstrapContentRemoteFromSeed } from "../../src/lib/content-remote-bootstrap";

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `git ${args.join(" ")} failed`,
    );
  }
  return result.stdout;
}

function createSeed(
  root: string,
  filePath = "doc/getting-started.md",
  content = "# Getting Started\n",
): string {
  const seedPath = join(root, "seed");
  const fullPath = join(seedPath, filePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  return seedPath;
}

function listRemoteFiles(remotePath: string, branch = "main"): string[] {
  return git(process.cwd(), [
    "--git-dir",
    remotePath,
    "ls-tree",
    "-r",
    "--name-only",
    branch,
  ])
    .trim()
    .split("\n")
    .filter(Boolean);
}

describe("bootstrapContentRemoteFromSeed", () => {
  it("creates a missing local bare remote", async () => {
    const root = mkdtempSync(join(tmpdir(), "directory-sync-bootstrap-"));
    try {
      const seedPath = createSeed(root);
      const remotePath = join(root, "content.git");

      await bootstrapContentRemoteFromSeed({
        gitUrl: `file://${remotePath}`,
        seedContentPath: seedPath,
        bootstrapFromSeed: true,
        logger: createSilentLogger(),
      });

      const isBare = git(process.cwd(), [
        "--git-dir",
        remotePath,
        "rev-parse",
        "--is-bare-repository",
      ]).trim();
      expect(isBare).toBe("true");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("seeds an empty local bare remote from seedContentPath", async () => {
    const root = mkdtempSync(join(tmpdir(), "directory-sync-bootstrap-"));
    try {
      const seedPath = createSeed(root, "doc/getting-started.md");
      const remotePath = join(root, "content.git");
      git(process.cwd(), [
        "init",
        "--bare",
        "--initial-branch=main",
        remotePath,
      ]);

      await bootstrapContentRemoteFromSeed({
        gitUrl: `file://${remotePath}`,
        seedContentPath: seedPath,
        bootstrapFromSeed: true,
        logger: createSilentLogger(),
      });

      expect(listRemoteFiles(remotePath)).toContain("doc/getting-started.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does nothing when the remote already has the branch", async () => {
    const root = mkdtempSync(join(tmpdir(), "directory-sync-bootstrap-"));
    try {
      const firstSeed = createSeed(root, "doc/original.md");
      const secondSeed = join(root, "second-seed");
      mkdirSync(join(secondSeed, "doc"), { recursive: true });
      writeFileSync(join(secondSeed, "doc/new.md"), "# New\n");
      const remotePath = join(root, "content.git");

      await bootstrapContentRemoteFromSeed({
        gitUrl: `file://${remotePath}`,
        seedContentPath: firstSeed,
        bootstrapFromSeed: true,
        logger: createSilentLogger(),
      });

      await bootstrapContentRemoteFromSeed({
        gitUrl: `file://${remotePath}`,
        seedContentPath: secondSeed,
        bootstrapFromSeed: true,
        logger: createSilentLogger(),
      });

      expect(listRemoteFiles(remotePath)).toEqual(["doc/original.md"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when seedContentPath is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "directory-sync-bootstrap-"));
    try {
      const remotePath = join(root, "content.git");

      let caught: unknown;
      try {
        await bootstrapContentRemoteFromSeed({
          gitUrl: `file://${remotePath}`,
          bootstrapFromSeed: true,
          logger: createSilentLogger(),
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch("requires seedContentPath");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves non-file remotes alone", async () => {
    const root = mkdtempSync(join(tmpdir(), "directory-sync-bootstrap-"));
    try {
      const seedPath = createSeed(root);

      const result = await bootstrapContentRemoteFromSeed({
        gitUrl: "https://github.com/rizom-ai/content.git",
        seedContentPath: seedPath,
        bootstrapFromSeed: true,
        logger: createSilentLogger(),
      });
      expect(result).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
