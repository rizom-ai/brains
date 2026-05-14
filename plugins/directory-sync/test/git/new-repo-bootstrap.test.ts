import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { GitSync } from "../../src/lib/git-sync";
import { createSilentLogger } from "@brains/test-utils";

describe("GitSync new-repo bootstrap regression", () => {
  let testDir: string;
  let remoteDir: string;
  let dataDir: string;
  let gitSync: GitSync | undefined;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-git-bootstrap-${Date.now()}`);
    remoteDir = join(testDir, "remote.git");
    dataDir = join(testDir, "brain-data");

    mkdirSync(testDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    execSync("git init --bare --initial-branch=main", {
      cwd: remoteDir,
      stdio: "ignore",
    });
  });

  afterEach(() => {
    gitSync?.cleanup();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createGitSync(branch = "main"): GitSync {
    gitSync = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      gitUrl: remoteDir,
      branch,
      authorName: "Test",
      authorEmail: "test@example.com",
    });
    return gitSync;
  }

  function headFile(): string {
    return readFileSync(join(dataDir, ".git", "HEAD"), "utf-8").trim();
  }

  function symbolicHead(): string {
    return execSync("git symbolic-ref HEAD", {
      cwd: dataDir,
      encoding: "utf-8",
    }).trim();
  }

  function writeDefault(): void {
    writeFileSync(join(dataDir, "default.md"), "# Default");
  }

  function listTracked(dir: string, ref?: string): string[] {
    const cmd = ref ? `git ls-tree -r --name-only ${ref}` : "git ls-files";
    return execSync(cmd, { cwd: dir, encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .sort();
  }

  it("initializes cleanly when default files already exist and the remote is empty", async () => {
    writeDefault();
    mkdirSync(join(dataDir, "base"), { recursive: true });
    writeFileSync(join(dataDir, "base", "welcome.md"), "# Welcome");

    const gs = createGitSync();
    await gs.initialize();

    expect(headFile()).toBe("ref: refs/heads/main");
    expect(symbolicHead()).toBe("refs/heads/main");

    const tracked = listTracked(dataDir);
    expect(tracked).toContain("default.md");
    expect(tracked).toContain("base/welcome.md");
  });

  it("repairs an invalid HEAD left by a broken bootstrap", async () => {
    writeDefault();
    execSync("git init --initial-branch=main", {
      cwd: dataDir,
      stdio: "ignore",
    });
    writeFileSync(join(dataDir, ".git", "HEAD"), "ref: refs/heads/.invalid\n");

    const gs = createGitSync();
    await gs.initialize();

    expect(headFile()).toBe("ref: refs/heads/main");
    expect(symbolicHead()).toBe("refs/heads/main");

    writeFileSync(join(dataDir, "after-repair.md"), "# Repaired");
    await gs.commit("post-repair commit");

    const log = execSync("git log --oneline", {
      cwd: dataDir,
      encoding: "utf-8",
    }).trim();
    expect(log).toContain("post-repair commit");
  });

  it("uses the configured non-default branch for empty-remote bootstrap", async () => {
    writeDefault();

    const gs = createGitSync("trunk");
    await gs.initialize();

    expect(headFile()).toBe("ref: refs/heads/trunk");
    expect(symbolicHead()).toBe("refs/heads/trunk");

    await gs.pull();

    const remoteBranches = execSync("git branch --list", {
      cwd: remoteDir,
      encoding: "utf-8",
    });
    expect(remoteBranches).toContain("trunk");

    expect(listTracked(remoteDir, "trunk")).toContain("default.md");
  });

  it("prefers remote content over preexisting local defaults when the remote already has history", async () => {
    const seedDir = join(testDir, "seed");
    execSync(`git clone ${remoteDir} ${seedDir}`, { stdio: "ignore" });
    execSync("git config user.name Seed && git config user.email s@s.com", {
      cwd: seedDir,
      stdio: "ignore",
    });
    mkdirSync(join(seedDir, "post"), { recursive: true });
    writeFileSync(join(seedDir, "post", "remote.md"), "# Remote");
    execSync("git add -A && git commit -m 'seed remote' && git push", {
      cwd: seedDir,
      stdio: "ignore",
    });

    writeDefault();

    const gs = createGitSync();
    await gs.initialize();
    await gs.pull();

    expect(listTracked(dataDir)).toEqual(["post/remote.md"]);
    expect(existsSync(join(dataDir, "default.md"))).toBe(false);
    expect(existsSync(join(dataDir, "post", "remote.md"))).toBe(true);
  });
});
