import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Multi-model evals need isolated git remotes per model.
 * A shared git remote causes push failures because each model's
 * directory-sync creates different commit history.
 *
 * The fix: prepareEvalEnvironment creates a per-model git remote
 * and sets EVAL_GIT_REMOTE in process.env so the brain.eval.yaml
 * can interpolate it into the directory-sync gitUrl config.
 *
 * brain.eval.yaml:
 *   plugins:
 *     directory-sync:
 *       git:
 *         gitUrl: "file://${EVAL_GIT_REMOTE}"
 */
describe("EVAL_GIT_REMOTE interpolation in brain.eval.yaml", () => {
  afterEach(() => {
    delete process.env["EVAL_GIT_REMOTE"];
  });

  it("parseInstanceOverrides should interpolate EVAL_GIT_REMOTE into gitUrl", async () => {
    const { parseInstanceOverrides } = await import("@brains/app");
    process.env["EVAL_GIT_REMOTE"] = "/tmp/brain-eval-42-git-remote";

    const yaml = `
brain: rover
plugins:
  directory-sync:
    git:
      gitUrl: "file://\${EVAL_GIT_REMOTE}"
`;
    const overrides = parseInstanceOverrides(yaml);
    const dsConfig = overrides.plugins?.["directory-sync"] as Record<
      string,
      unknown
    >;
    const gitConfig = dsConfig?.["git"] as Record<string, unknown>;
    expect(gitConfig?.["gitUrl"]).toBe("file:///tmp/brain-eval-42-git-remote");
  });

  it("should drop gitUrl when EVAL_GIT_REMOTE is not set", async () => {
    const { parseInstanceOverrides } = await import("@brains/app");
    delete process.env["EVAL_GIT_REMOTE"];

    const yaml = `
brain: rover
plugins:
  directory-sync:
    git:
      gitUrl: "file://\${EVAL_GIT_REMOTE}"
`;
    const overrides = parseInstanceOverrides(yaml);
    const dsConfig = overrides.plugins?.["directory-sync"] as Record<
      string,
      unknown
    >;
    const gitConfig = dsConfig?.["git"] as Record<string, unknown>;
    // interpolateEnv drops entries with unset env vars
    expect(gitConfig?.["gitUrl"]).toBeUndefined();
  });
});

describe("per-model git remote isolation", () => {
  const remotes: string[] = [];

  afterEach(() => {
    for (const p of remotes) {
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
    }
    remotes.length = 0;
    delete process.env["EVAL_GIT_REMOTE"];
  });

  function createGitRemote(evalDbBase: string): string {
    const gitRemotePath = `${evalDbBase}-git-remote`;
    if (existsSync(gitRemotePath)) {
      rmSync(gitRemotePath, { recursive: true, force: true });
    }
    mkdirSync(gitRemotePath, { recursive: true });
    execSync("git init --bare", { cwd: gitRemotePath, stdio: "ignore" });
    remotes.push(gitRemotePath);
    return gitRemotePath;
  }

  it("should create distinct git remotes for different models", () => {
    const remoteA = createGitRemote(
      join(tmpdir(), "brain-eval-123-gpt-4o-mini"),
    );
    const remoteB = createGitRemote(
      join(tmpdir(), "brain-eval-123-claude-haiku"),
    );

    expect(remoteA).not.toBe(remoteB);
    expect(existsSync(remoteA)).toBe(true);
    expect(existsSync(remoteB)).toBe(true);
  });

  it("both remotes should be valid bare git repos", () => {
    const remoteA = createGitRemote(join(tmpdir(), "brain-eval-456-model-a"));
    const remoteB = createGitRemote(join(tmpdir(), "brain-eval-456-model-b"));

    // A bare repo has a HEAD file
    expect(existsSync(join(remoteA, "HEAD"))).toBe(true);
    expect(existsSync(join(remoteB, "HEAD"))).toBe(true);
  });

  it("should be pushable independently", () => {
    const remoteA = createGitRemote(join(tmpdir(), "brain-eval-789-model-a"));
    const remoteB = createGitRemote(join(tmpdir(), "brain-eval-789-model-b"));

    // Create local repos that push to each remote
    for (const [remote, label] of [
      [remoteA, "a"],
      [remoteB, "b"],
    ] as const) {
      const local = join(tmpdir(), `brain-eval-local-${label}-${Date.now()}`);
      mkdirSync(local, { recursive: true });
      execSync(`git init && git commit --allow-empty -m "init ${label}"`, {
        cwd: local,
        stdio: "ignore",
      });
      execSync(`git remote add origin file://${remote}`, {
        cwd: local,
        stdio: "ignore",
      });
      execSync("git push -u origin HEAD", {
        cwd: local,
        stdio: "ignore",
      });
      rmSync(local, { recursive: true, force: true });
    }
  });

  it("EVAL_GIT_REMOTE env var should be set per model", () => {
    const remoteA = createGitRemote(join(tmpdir(), "brain-eval-env-model-a"));
    process.env["EVAL_GIT_REMOTE"] = remoteA;
    expect(process.env["EVAL_GIT_REMOTE"]).toBe(remoteA);

    const remoteB = createGitRemote(join(tmpdir(), "brain-eval-env-model-b"));
    process.env["EVAL_GIT_REMOTE"] = remoteB;
    expect(process.env["EVAL_GIT_REMOTE"]).toBe(remoteB);
    expect(process.env["EVAL_GIT_REMOTE"]).not.toContain("model-a");
  });
});
