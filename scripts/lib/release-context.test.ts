import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReleaseContext, type ReleaseContext } from "./release-context";

async function git(root: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(stderr);
}

async function initialize(root: string): Promise<void> {
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "test@example.test");
  await git(root, "config", "user.name", "Release test");
  await mkdir(join(root, "packages/brain-cli"), { recursive: true });
}
async function commit(root: string, message: string): Promise<void> {
  await git(root, "add", ".");
  await git(root, "commit", "-qm", message);
}

test("stable graduation survives later commits and retains the exact final alpha until published", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-context-"));
  let published = false;
  const context = (): Promise<ReleaseContext> =>
    readReleaseContext(root, async (version) => {
      expect(version).toBe("0.2.0");
      return published;
    });
  try {
    await initialize(root);
    await mkdir(join(root, ".changeset"));
    const pre = join(root, ".changeset/pre.json");
    const manifest = join(root, "packages/brain-cli/package.json");
    await writeFile(manifest, JSON.stringify({ version: "0.2.0-alpha.400" }));
    await writeFile(pre, JSON.stringify({ mode: "pre" }));
    await commit(root, "alpha");
    expect(await context()).toEqual({ mode: "standard" });
    await writeFile(pre, JSON.stringify({ mode: "exit" }));
    await commit(root, "authorized exit");
    expect(await context()).toEqual({
      mode: "stable-exit",
      brain_candidate_version: "0.2.0-alpha.400",
    });
    await rm(pre);
    await writeFile(manifest, JSON.stringify({ version: "0.2.0" }));
    await commit(root, "global stable version");
    const expected: ReleaseContext = {
      mode: "stable-version",
      brain_candidate_version: "0.2.0-alpha.400",
    };
    expect(await context()).toEqual(expected);
    await writeFile(join(root, "README.md"), "A follow-up correction");
    await commit(root, "follow-up");
    expect(await context()).toEqual(expected);
    const unavailable = await readReleaseContext(root, async () => {
      throw new Error("registry unavailable");
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(unavailable).toMatchObject({ message: "registry unavailable" });
    published = true;
    expect(await context()).toEqual({ mode: "standard" });
    await writeFile(manifest, JSON.stringify({ version: "0.2.1" }));
    await commit(root, "later stable patch");
    expect(await context()).toEqual({ mode: "standard" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing stable provenance fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-context-missing-"));
  try {
    await initialize(root);
    await writeFile(
      join(root, "packages/brain-cli/package.json"),
      JSON.stringify({ version: "0.2.0" }),
    );
    await commit(root, "stable without provenance");
    const failure = await readReleaseContext(root).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({
      message: expect.stringContaining("Cannot establish release provenance"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
