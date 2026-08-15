import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Phase 1 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Two properties are locked here. The first three assertions already hold and
 * must keep holding: production requires Bun and `git`, not a shell wrapper or
 * an undeclared userland contract. The superseded implementation shipped
 * `git-wrapper.sh` and depended on `flock`, `setsid`, `timeout`, bash, and
 * coreutils, which also made the broker Linux-only.
 *
 * The last assertion does not hold yet. `simple-git` is a Git adapter, not an
 * ownership boundary, and constructing it in an app role puts a Git child back
 * on a web or worker event loop. It goes green when Phase 2 moves operation
 * sequences behind the broker.
 */

const SOURCE_ROOT = join(import.meta.dir, "../../src");

/** Direct Git execution is permitted only here; see the plan's Phase 1 note. */
const SEED_BOOTSTRAP = "lib/content-remote-bootstrap.ts";

async function sourcePaths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? sourcePaths(path) : [path];
    }),
  );
  return nested.flat();
}

async function sources(): Promise<Array<{ path: string; body: string }>> {
  const paths = (await sourcePaths(SOURCE_ROOT)).filter((path) =>
    path.endsWith(".ts"),
  );
  return Promise.all(
    paths.map(async (path) => ({
      path: path.slice(SOURCE_ROOT.length + 1),
      body: await readFile(path, "utf-8"),
    })),
  );
}

describe("git execution boundary", () => {
  it("ships no shell asset", async () => {
    const shipped = (await sourcePaths(SOURCE_ROOT)).filter((path) =>
      path.endsWith(".sh"),
    );

    expect(shipped).toEqual([]);
  });

  it("requires no ambient helper beyond git", async () => {
    const forbidden = ["flock", "setsid", "coreutils"];
    const offenders = (await sources()).flatMap(({ path, body }) =>
      forbidden
        .filter((binary) => new RegExp(`\\b${binary}\\b`).test(body))
        .map((binary) => `${path}: ${binary}`),
    );

    expect(offenders).toEqual([]);
  });

  it.failing(
    "keeps direct Git execution to the local seed bootstrap",
    async () => {
      // The seed bootstrap builds a throwaway worktree and a bare remote and
      // never touches a managed checkout, so it sits outside broker ownership
      // rather than being an exception to it.
      //
      // `git-stall.ts` is the other site today: it spawns network Git in the app
      // process with a stall deadline. That deadline bounds a silent remote but
      // cannot establish that Git is gone, which is why it is superseded rather
      // than kept — Phase 2 moves pull and push behind the broker.
      const offenders = (await sources())
        .filter(
          ({ body }) =>
            body.includes("Bun.spawn") ||
            body.includes("spawnSync") ||
            body.includes("node:child_process"),
        )
        .map(({ path }) => path)
        .sort();

      expect(offenders).toEqual([SEED_BOOTSTRAP]);
    },
  );

  it("declares simple-git as a runtime dependency", async () => {
    const manifest = JSON.parse(
      await readFile(join(import.meta.dir, "../../package.json"), "utf-8"),
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(manifest.dependencies ?? {})).toContain("simple-git");
  });

  it.failing("constructs simple-git only inside the broker", async () => {
    const offenders = (await sources())
      .filter(
        ({ path, body }) =>
          /\bsimpleGit\s*\(/.test(body) && !path.startsWith("lib/broker/"),
      )
      .map(({ path }) => path)
      .sort();

    expect(offenders).toEqual([]);
  });
});
