import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { execSync } from "child_process";
import { z } from "@brains/utils";
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

    const gitUrlSchema = z.object({
      plugins: z.object({
        "directory-sync": z.object({
          git: z.object({
            gitUrl: z.string(),
          }),
        }),
      }),
    });

    const parsed = gitUrlSchema.safeParse(overrides);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.plugins["directory-sync"].git.gitUrl).toBe(
        "file:///tmp/brain-eval-42-git-remote",
      );
    }
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
    // When env var is unset, interpolateEnv drops the gitUrl entry
    const dsConfig = overrides.plugins?.["directory-sync"];
    const gitValue = dsConfig?.["git"];
    // git key may be dropped entirely or be an empty object
    if (typeof gitValue === "object" && gitValue !== null) {
      const keys = Object.keys(gitValue);
      expect(keys).not.toContain("gitUrl");
    }
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

  // NOTE: there used to be a `should be pushable independently` test here
  // that created local repos with raw `execSync("git commit")` and pushed
  // to the bare remotes. It was removed because:
  //
  //   1. The real eval runner never does this — `prepareEvalEnvironment`
  //      in run-evaluations.ts only calls `git init --bare`. The actual
  //      commits + pushes come from directory-sync's GitSync class, which
  //      has its own push tests in plugins/directory-sync/test/git/.
  //
  //   2. GitSync has brain-level defaults (authorName: "Brain",
  //      authorEmail: "brain@localhost" in its Zod schema) that flow into
  //      every commit automatically. The deleted test bypassed GitSync
  //      entirely, so none of those defaults applied — it failed on CI
  //      because clean runners have no global git identity.
  //
  // If you need an end-to-end 'multi-model eval pushes without collision'
  // test, write it as an integration test that goes through GitSync.

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
