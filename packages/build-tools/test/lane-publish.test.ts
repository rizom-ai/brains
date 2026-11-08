import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createTempDir } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { runLanePublish } from "../src/lane-publish";
import type { ReleaseLane, WorkspacePackageLike } from "../src/release-lanes";

const repositoryRoot = join(import.meta.dir, "../../..");
const changesetBin = join(repositoryRoot, "node_modules/.bin/changeset");

/**
 * The registry as npm answered the alpha.650 Core Release. @rizom/brain and
 * @rizom/ops have only ever published alphas; @rizom/brain-ui, and the
 * thefourth site and theme, carry the 0.0.0-stage placeholder their
 * trusted-publishing bootstrap left.
 */
const registry: Record<string, unknown> = {
  "@rizom/brain": {
    versions: ["0.1.1-alpha.0", "0.2.0-alpha.649", "0.2.0-alpha.650"],
    "dist-tags": { alpha: "0.1.1-alpha.0", latest: "0.2.0-alpha.650" },
  },
  "@rizom/ops": {
    versions: ["0.2.0-alpha.0", "0.2.0-alpha.650"],
    "dist-tags": { alpha: "0.2.0-alpha.0", latest: "0.2.0-alpha.650" },
  },
  "@rizom/brain-ui": {
    versions: ["0.0.0-stage", "0.2.0-alpha.649", "0.2.0-alpha.650"],
    "dist-tags": { alpha: "0.2.0-alpha.650", latest: "0.2.0-alpha.649" },
  },
  "@rizom/site-thefourth": {
    versions: ["0.0.0-stage", "0.2.0-alpha.1", "0.2.0-alpha.12"],
    "dist-tags": { alpha: "0.2.0-alpha.12", latest: "0.2.0-alpha.1" },
  },
};

const planSchema = z.object({
  version: z.literal(1),
  plan: z.array(
    z.array(
      z.looseObject({
        kind: z.string(),
        name: z.string(),
        tag: z.string().optional(),
      }),
    ),
  ),
});

/** A workspace in prerelease mode, as the repository is, with fake npm on PATH. */
async function createWorkspace(): Promise<{
  root: string;
  packages: WorkspacePackageLike[];
  env: Record<string, string>;
}> {
  const root = await createTempDir("lane-publish-");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "release-fixture",
      private: true,
      workspaces: ["packages/*"],
    }),
  );
  // The lockfile marks the root an npm workspace, which is how the publish tool is chosen.
  await writeFile(
    join(root, "package-lock.json"),
    JSON.stringify({
      name: "release-fixture",
      lockfileVersion: 3,
      packages: {},
    }),
  );
  await mkdir(join(root, ".changeset"));
  await writeFile(
    join(root, ".changeset/config.json"),
    JSON.stringify({
      changelog: false,
      commit: false,
      fixed: [["@rizom/brain", "@rizom/brain-ui", "@rizom/ops"]],
      linked: [],
      access: "public",
      baseBranch: "main",
      updateInternalDependencies: "patch",
      ignore: [],
    }),
  );
  await writeFile(
    join(root, ".changeset/pre.json"),
    `${JSON.stringify({ mode: "pre", tag: "alpha" }, null, 2)}\n`,
  );

  const packages = await Promise.all(
    Object.keys(registry).map(async (name) => {
      const dir = join(root, "packages", name.replace("@rizom/", ""));
      const packageJson = { name, version: "0.2.0-alpha.651" };
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ ...packageJson, publishConfig: { access: "public" } }),
      );
      return { dir, packageJson };
    }),
  );

  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "registry.json"), JSON.stringify(registry));
  await writeFile(
    join(bin, "npm"),
    [
      "#!/usr/bin/env bun",
      'const registry = await Bun.file(import.meta.dir + "/registry.json").json();',
      "const [command, name] = process.argv.slice(2);",
      'if (command === "--version") { console.log("11.6.1"); process.exit(0); }',
      'if (command !== "info") process.exit(1);',
      "const info = registry[name];",
      'if (info === undefined) { console.log(JSON.stringify({ error: { code: "E404" } })); process.exit(1); }',
      "console.log(JSON.stringify({ name, ...info }));",
      "",
    ].join("\n"),
  );
  await chmod(join(bin, "npm"), 0o755);
  return {
    root,
    packages,
    env: { PATH: `${bin}:${process.env["PATH"] ?? ""}` },
  };
}

/** The dist-tag the real changesets publish plan gives each package of a lane. */
async function plannedTags(
  root: string,
  env: Record<string, string>,
): Promise<Record<string, string>> {
  const output = join(root, "plan.json");
  const child = Bun.spawn([changesetBin, "publish-plan", "-o", output], {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0)
    throw new Error(`changeset publish-plan failed\n${stderr}`);
  const { plan } = planSchema.parse(JSON.parse(await readFile(output, "utf8")));
  return Object.fromEntries(
    plan
      .flat()
      .filter((release) => release.kind === "publish")
      .map((release) => [release.name, release.tag ?? ""]),
  );
}

async function laneTags(lane: ReleaseLane): Promise<{
  unwrapped: Record<string, string>;
  published: Record<string, string>;
  preState: string;
}> {
  const { root, packages, env } = await createWorkspace();
  const preState = await readFile(join(root, ".changeset/pre.json"), "utf8");
  const unwrapped = await plannedTags(root, env);
  const published = await runLanePublish(
    { repositoryRoot: root, packages, lane },
    () => plannedTags(root, env),
  );
  expect(await readFile(join(root, ".changeset/pre.json"), "utf8")).toBe(
    preState,
  );
  return { unwrapped, published, preState };
}

describe("runLanePublish", () => {
  test("publishes every core package to latest, whatever the registry history", async () => {
    const { unwrapped, published } = await laneTags("core");

    // Changesets alone splits the core group by registry history.
    expect(unwrapped["@rizom/brain"]).toBe("latest");
    expect(unwrapped["@rizom/brain-ui"]).toBe("alpha");

    expect(published).toEqual({
      "@rizom/brain": "latest",
      "@rizom/brain-ui": "latest",
      "@rizom/ops": "latest",
    });
  }, 60_000);

  test("publishes every site package to latest too", async () => {
    const { unwrapped, published } = await laneTags("site");

    expect(unwrapped["@rizom/site-thefourth"]).toBe("alpha");
    expect(published).toEqual({ "@rizom/site-thefourth": "latest" });
  }, 60_000);

  test("refuses to publish when an earlier publish left the prerelease state aside", async () => {
    const { root, packages } = await createWorkspace();
    await writeFile(
      join(root, ".changeset/pre.json.publishing"),
      `${JSON.stringify({ mode: "pre", tag: "alpha" })}\n`,
    );
    let published = false;

    const failure = await runLanePublish(
      { repositoryRoot: root, packages, lane: "core" },
      async () => {
        published = true;
      },
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(published).toBe(false);
  });

  test("restores the prerelease state when the publish fails", async () => {
    const { root, packages } = await createWorkspace();
    const preState = await readFile(join(root, ".changeset/pre.json"), "utf8");

    const failure = await runLanePublish(
      { repositoryRoot: root, packages, lane: "core" },
      async () => {
        throw new Error("publish failed");
      },
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(await readFile(join(root, ".changeset/pre.json"), "utf8")).toBe(
      preState,
    );
  });
});
