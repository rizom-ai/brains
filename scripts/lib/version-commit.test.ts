import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { gitIn, pushVersionCommit, type Git } from "./version-commit";

// Real repositories, isolated from the machine's git configuration.
const env = {
  PATH: process.env["PATH"],
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Release Test",
  GIT_AUTHOR_EMAIL: "release@test.invalid",
  GIT_COMMITTER_NAME: "Release Test",
  GIT_COMMITTER_EMAIL: "release@test.invalid",
};

let root: string;
let origin: string;
let runner: string;
let developer: string;

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await gitIn(cwd, env)(args);
  if (result.exitCode !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

async function write(cwd: string, file: string, text: string): Promise<void> {
  await Bun.write(join(cwd, file), text);
}

/** Lands a commit on origin's main the way a merged pull request does. */
async function land(file: string, text: string): Promise<string> {
  await git(developer, "pull", "--quiet", "--ff-only", "origin", "main");
  await write(developer, file, text);
  await git(developer, "add", "-A");
  await git(developer, "commit", "--quiet", "-m", `land ${file}`);
  await git(developer, "push", "--quiet", "origin", "HEAD:main");
  return git(developer, "rev-parse", "HEAD");
}

function release(
  mergeWhenMainMoved = true,
  wrap: (real: Git) => Git = (real): Git => real,
): Promise<string> {
  return pushVersionCommit({
    git: wrap(gitIn(runner, env)),
    message: "chore(release): version packages",
    mergeWhenMainMoved,
    log: (): void => {},
  });
}

/** Why the release failed; a release that succeeds matches no reason. */
function refusal(pending: Promise<string>): Promise<string> {
  return pending.then(
    (outcome) => `released: ${outcome}`,
    (error: unknown) => getErrorMessage(error),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "version-commit-"));
  origin = join(root, "origin.git");
  runner = join(root, "runner");
  developer = join(root, "developer");
  await git(root, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  await git(root, "clone", "--quiet", origin, runner);
  await git(runner, "checkout", "--quiet", "-b", "main");
  await write(runner, "package.json", '{\n  "version": "1.0.0"\n}\n');
  await write(runner, "src.ts", "export const a = 1;\n");
  await git(runner, "add", "-A");
  await git(runner, "commit", "--quiet", "-m", "seed");
  await git(runner, "push", "--quiet", "origin", "HEAD:main");
  await git(root, "clone", "--quiet", origin, developer);
  // The release step versions the checked-out main.
  await write(runner, "package.json", '{\n  "version": "1.0.1"\n}\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("pushing the release version commit", () => {
  test("pushes straight onto main when main has not moved", async () => {
    const base = await git(runner, "rev-parse", "HEAD");

    expect(await release()).toBe("pushed");

    const version = await git(runner, "rev-parse", "HEAD");
    expect(await git(runner, "rev-parse", "HEAD^")).toBe(base);
    expect(await git(origin, "rev-parse", "main")).toBe(version);
  });

  test("commits nothing when versioning changed nothing", async () => {
    await git(runner, "checkout", "--quiet", "--", "package.json");
    const base = await git(runner, "rev-parse", "HEAD");

    expect(await release()).toBe("unchanged");

    expect(await git(runner, "rev-parse", "HEAD")).toBe(base);
    expect(await git(origin, "rev-parse", "main")).toBe(base);
  });

  test("merges into a main that moved during the release, and keeps the version commit checked out for publishing", async () => {
    const base = await git(runner, "rev-parse", "HEAD");
    const landed = await land("other.ts", "export const b = 2;\n");

    expect(await release()).toBe("merged");

    // Publishing builds exactly the verified commit plus its version bump.
    const version = await git(runner, "rev-parse", "HEAD");
    expect(await git(runner, "rev-parse", "HEAD^")).toBe(base);
    expect(await Bun.file(join(runner, "other.ts")).exists()).toBe(false);
    // Main keeps the landed change and gains the version bump.
    expect(await git(origin, "rev-parse", "main^1")).toBe(landed);
    expect(await git(origin, "rev-parse", "main^2")).toBe(version);
    expect(await git(origin, "show", "main:package.json")).toContain("1.0.1");
    expect(await git(origin, "show", "main:other.ts")).toContain("b = 2");
  });

  test("merges onto the newest main when main moves again during the merge", async () => {
    await land("other.ts", "export const b = 2;\n");
    let pushes = 0;
    let latest = "";
    const concurrent =
      (real: Git): Git =>
      async (args) => {
        if (args[0] === "push" && ++pushes === 2)
          latest = await land("more.ts", "export const c = 3;\n");
        return real(args);
      };

    expect(await release(true, concurrent)).toBe("merged");

    expect(await git(origin, "rev-parse", "main^1")).toBe(latest);
    expect(await git(origin, "rev-parse", "main^2")).toBe(
      await git(runner, "rev-parse", "HEAD"),
    );
  });

  test("gives up when main keeps moving", async () => {
    let lands = 0;
    const busy =
      (real: Git): Git =>
      async (args) => {
        if (args[0] === "push")
          await land(`busy-${++lands}.ts`, `export const n = ${lands};\n`);
        return real(args);
      };

    expect(await refusal(release(true, busy))).toContain("kept moving");
  });

  test("never merges during stable graduation", async () => {
    const landed = await land("other.ts", "export const b = 2;\n");

    expect(await refusal(release(false))).toContain("stable");

    expect(await git(origin, "rev-parse", "main")).toBe(landed);
  });

  test("fails without pushing when the version bump conflicts with main", async () => {
    const landed = await land("package.json", '{\n  "version": "9.9.9"\n}\n');

    expect(await refusal(release())).toContain("conflicts");

    expect(await git(origin, "rev-parse", "main")).toBe(landed);
  });

  test("fails without merging when the push is refused but main has not moved", async () => {
    const base = await git(runner, "rev-parse", "HEAD");
    const hook = join(origin, "hooks", "pre-receive");
    await write(origin, "hooks/pre-receive", "#!/bin/sh\nexit 1\n");
    await Bun.spawn(["chmod", "+x", hook]).exited;

    expect(await refusal(release())).toContain("has not moved");

    expect(await git(origin, "rev-parse", "main")).toBe(base);
  });

  test("fails when main no longer contains the released commit", async () => {
    await git(developer, "checkout", "--quiet", "--orphan", "rewrite");
    await write(developer, "src.ts", "export const rewritten = true;\n");
    await git(developer, "add", "-A");
    await git(developer, "commit", "--quiet", "-m", "rewrite");
    await git(developer, "push", "--quiet", "--force", "origin", "HEAD:main");
    const rewritten = await git(developer, "rev-parse", "HEAD");

    expect(await refusal(release())).toContain("no longer contains");

    expect(await git(origin, "rev-parse", "main")).toBe(rewritten);
  });
});
