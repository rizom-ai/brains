import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  readFileSync,
  mkdtempSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runGit } from "./real-git";
import { createBrokerGitSync } from "./broker-git-sync";
import type { IGitSync } from "../../src/types";
import { createSilentLogger } from "@brains/test-utils";

describe("GitSync new-repo bootstrap regression", () => {
  let testDir: string;
  let remoteDir: string;
  let dataDir: string;
  let gitSync: IGitSync | undefined;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), "test-git-bootstrap-"));
    remoteDir = join(testDir, "remote.git");
    dataDir = join(testDir, "brain-data");

    mkdirSync(testDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    await runGit(["init", "--bare", "--initial-branch=main"], remoteDir);
  });

  afterEach(async () => {
    await gitSync?.cleanup();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  async function createGitSync(branch = "main"): Promise<IGitSync> {
    gitSync = await createBrokerGitSync({
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

  async function symbolicHead(): Promise<string> {
    return (await runGit(["symbolic-ref", "HEAD"], dataDir)).trim();
  }

  function writeDefault(): void {
    writeFileSync(join(dataDir, "default.md"), "# Default");
  }

  async function listTracked(dir: string, ref?: string): Promise<string[]> {
    const args = ref ? ["ls-tree", "-r", "--name-only", ref] : ["ls-files"];
    return (await runGit(args, dir)).trim().split("\n").filter(Boolean).sort();
  }

  it("initializes cleanly when default files already exist and the remote is empty", async () => {
    writeDefault();
    mkdirSync(join(dataDir, "note"), { recursive: true });
    writeFileSync(join(dataDir, "note", "welcome.md"), "# Welcome");

    const gs = await createGitSync();
    await gs.initialize();

    expect(headFile()).toBe("ref: refs/heads/main");
    expect(await symbolicHead()).toBe("refs/heads/main");

    const tracked = await listTracked(dataDir);
    expect(tracked).toContain("default.md");
    expect(tracked).toContain("note/welcome.md");
  });

  it("repairs an invalid HEAD left by a broken bootstrap", async () => {
    writeDefault();
    await runGit(["init", "--initial-branch=main"], dataDir);
    writeFileSync(join(dataDir, ".git", "HEAD"), "ref: refs/heads/.invalid\n");

    const gs = await createGitSync();
    await gs.initialize();

    expect(headFile()).toBe("ref: refs/heads/main");
    expect(await symbolicHead()).toBe("refs/heads/main");

    writeFileSync(join(dataDir, "after-repair.md"), "# Repaired");
    await gs.commit("post-repair commit");

    const log = (await runGit(["log", "--oneline"], dataDir)).trim();
    expect(log).toContain("post-repair commit");
  });

  it("uses the configured non-default branch for empty-remote bootstrap", async () => {
    writeDefault();

    const gs = await createGitSync("trunk");
    await gs.initialize();

    expect(headFile()).toBe("ref: refs/heads/trunk");
    expect(await symbolicHead()).toBe("refs/heads/trunk");

    await gs.pull();

    const remoteBranches = await runGit(["branch", "--list"], remoteDir);
    expect(remoteBranches).toContain("trunk");

    expect(await listTracked(remoteDir, "trunk")).toContain("default.md");
  });

  it("prefers remote content over preexisting local defaults when the remote already has history", async () => {
    const seedDir = join(testDir, "seed");
    await runGit(["clone", remoteDir, seedDir], testDir);
    await runGit(["config", "user.name", "Seed"], seedDir);
    await runGit(["config", "user.email", "seed@example.com"], seedDir);
    mkdirSync(join(seedDir, "post"), { recursive: true });
    writeFileSync(join(seedDir, "post", "remote.md"), "# Remote");
    await runGit(["add", "-A"], seedDir);
    await runGit(["commit", "-m", "seed remote"], seedDir);
    await runGit(["push"], seedDir);

    writeDefault();

    const gs = await createGitSync();
    await gs.initialize();
    await gs.pull();

    expect(await listTracked(dataDir)).toEqual(["post/remote.md"]);
    expect(existsSync(join(dataDir, "default.md"))).toBe(false);
    expect(existsSync(join(dataDir, "post", "remote.md"))).toBe(true);
  });
});
