import { afterEach, expect, test } from "bun:test";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import { readConfig } from "@changesets/config";
import { getPackages } from "@manypkg/get-packages";
import { migratePrereleaseHistory } from "@brains/build-tools";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "release-lane-cli-test-"));
  fixtures.push(root);
  await mkdir(join(root, ".changeset"));
  await mkdir(join(root, "home"));
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(root, "node_modules"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "release-lane-cli-fixture",
      private: true,
      workspaces: ["packages/*"],
      packageManager: "bun@1.4.0",
      scripts: {
        "changeset:version:raw": `node ${join(repositoryRoot, "node_modules/@changesets/cli/bin.js")} version`,
        "changeset:publish:raw": "bun record-scope.ts",
      },
    }),
  );
  const definitions = [
    {
      dir: "core",
      name: "@brains/core",
      version: "0.2.0-alpha.7",
      private: true,
    },
    { dir: "brain", name: "@rizom/brain", version: "0.2.0-alpha.7" },
    { dir: "ops", name: "@rizom/ops", version: "0.2.0-alpha.7" },
    { dir: "site", name: "@rizom/site-fixture", version: "0.2.0-alpha.7" },
    { dir: "lib", name: "peer-lib", version: "1.0.0" },
    {
      dir: "client",
      name: "peer-client",
      version: "1.0.0",
      peerDependencies: { "peer-lib": "^1.0.0" },
    },
  ];
  for (const { dir, ...definition } of definitions) {
    await mkdir(join(root, "packages", dir), { recursive: true });
    await writeFile(
      join(root, "packages", dir, "package.json"),
      JSON.stringify(definition),
    );
  }
  await writeFile(
    join(root, "bun.lock"),
    JSON.stringify({
      lockfileVersion: 3,
      workspaces: { "": { name: "release-lane-cli-fixture" } },
      packages: {},
    }),
  );
  await writeFile(
    join(root, ".changeset", "config.json"),
    JSON.stringify({
      changelog: false,
      commit: false,
      fixed: [["@brains/*", "@rizom/brain", "@rizom/ops"]],
      linked: [],
      access: "public",
      baseBranch: "main",
      updateInternalDependencies: "patch",
      ignore: [],
      privatePackages: { version: true, tag: false },
    }),
  );
  await writeFile(
    join(root, ".syncpackrc.json"),
    JSON.stringify({ versionGroups: [], semverGroups: [] }),
  );
  await writeFile(
    join(root, ".changeset", "pre.json"),
    JSON.stringify({
      mode: "pre",
      tag: "alpha",
      initialVersions: {
        "@brains/core": "0.2.0",
        "@rizom/brain": "0.2.0",
        "@rizom/ops": "0.2.0",
        "@rizom/site-fixture": "0.2.0",
      },
      changesets: ["core--past", "site--past"],
    }),
  );
  for (const name of [
    "core--past",
    "site--past",
    "core--fresh",
    "site--fresh",
  ]) {
    await writeFile(
      join(root, ".changeset", `${name}.md`),
      `---\n"@rizom/${name.startsWith("site") ? "site-fixture" : "brain"}": patch\n---\n\nExact ${name} source.\n`,
    );
  }
  return root;
}

async function run(
  root: string,
  script: string,
  ...args: string[]
): Promise<{ exit: number; output: string }> {
  const child = Bun.spawn(
    [process.execPath, join(repositoryRoot, "scripts", script), ...args],
    {
      cwd: root,
      env: {
        PATH: process.env["PATH"] ?? "/usr/bin:/bin",
        HOME: join(root, "home"),
        CI: "true",
        NO_COLOR: "1",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
    },
  );
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, output: stdout + stderr };
}

async function version(root: string, name: string): Promise<string> {
  const manifest: { version: string } = JSON.parse(
    await readFile(join(root, "packages", name, "package.json"), "utf8"),
  );
  return manifest.version;
}

test("first core CLI3 version archives old history without bumping the stashed site lane", async () => {
  const root = await fixture();
  const siteSource = await readFile(
    join(root, ".changeset", "site--fresh.md"),
    "utf8",
  );
  const check = await run(root, "release-lane.ts", "check");
  expect(check.exit).toBe(0);
  expect(await readdir(join(root, ".changeset"))).not.toContain("pre");
  const result = await run(root, "release-lane.ts", "version", "core");
  expect(result).toMatchObject({ exit: 0 });
  expect(await version(root, "core")).toBe("0.2.0-alpha.8");
  expect(await version(root, "brain")).toBe("0.2.0-alpha.8");
  expect(await version(root, "ops")).toBe("0.2.0-alpha.8");
  expect(await version(root, "site")).toBe("0.2.0-alpha.7");
  expect(
    await readFile(join(root, ".changeset", "site--fresh.md"), "utf8"),
  ).toBe(siteSource);
  expect(await readdir(join(root, ".changeset", "pre"))).toEqual(
    expect.arrayContaining([
      "core--past.md",
      "site--past.md",
      "core--fresh.md",
    ]),
  );
  expect((await run(root, "release-lane.ts", "version", "site")).exit).toBe(0);
  expect(await version(root, "site")).toBe("0.2.0-alpha.8");
  expect(await version(root, "brain")).toBe("0.2.0-alpha.8");
});

test("first site CLI3 version leaves the pending core lane byte-identical", async () => {
  const root = await fixture();
  const coreSource = await readFile(
    join(root, ".changeset", "core--fresh.md"),
    "utf8",
  );
  expect((await run(root, "release-lane.ts", "version", "site")).exit).toBe(0);
  expect(await version(root, "site")).toBe("0.2.0-alpha.8");
  expect(await version(root, "brain")).toBe("0.2.0-alpha.7");
  expect(await version(root, "core")).toBe("0.2.0-alpha.7");
  expect(
    await readFile(join(root, ".changeset", "core--fresh.md"), "utf8"),
  ).toBe(coreSource);
});

test("new archive stale references fail the real check before any version operation", async () => {
  const root = await fixture();
  await migratePrereleaseHistory(root);
  await writeFile(
    join(root, ".changeset", "pre", "core--retired.md"),
    '---\n"retired-package-fixture": patch\n---\n\nMust reject.\n',
  );
  const result = await run(root, "release-lane.ts", "check");
  expect(result.exit).not.toBe(0);
  expect(result.output).toContain(
    "pre/core--retired.md: retired-package-fixture",
  );
  expect(await version(root, "brain")).toBe("0.2.0-alpha.7");
});

test("stable exit remains a single coordinated core operation; site defers without mutating history", async () => {
  const root = await fixture();
  const state: Record<string, unknown> = JSON.parse(
    await readFile(join(root, ".changeset", "pre.json"), "utf8"),
  );
  state["mode"] = "exit";
  const text = JSON.stringify(state);
  await writeFile(join(root, ".changeset", "pre.json"), text);
  const site = await run(root, "release-lane.ts", "version", "site");
  expect(site.exit).toBe(0);
  expect(site.output).toContain("deferred");
  expect(await readFile(join(root, ".changeset", "pre.json"), "utf8")).toBe(
    text,
  );
  expect(await readdir(join(root, ".changeset"))).not.toContain("pre");
  const core = await run(root, "release-lane.ts", "version", "core");
  expect(core).toMatchObject({ exit: 0 });
  for (const name of ["core", "brain", "ops", "site"])
    expect(await version(root, name)).toBe("0.2.0");
  expect(await readdir(join(root, ".changeset"))).not.toContain("pre.json");
  expect(await readdir(join(root, ".changeset"))).not.toContain("pre");
});

test("failed raw version restores the opposite queue and retains exact migrated history", async () => {
  const root = await fixture();
  const manifest: { scripts: Record<string, string> } = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  manifest.scripts["changeset:version:raw"] = "bun fail-version.ts";
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  await writeFile(join(root, "fail-version.ts"), "process.exit(23);\n");
  const source = await readFile(
    join(root, ".changeset", "site--fresh.md"),
    "utf8",
  );
  expect((await run(root, "release-lane.ts", "version", "core")).exit).toBe(23);
  expect(
    await readFile(join(root, ".changeset", "site--fresh.md"), "utf8"),
  ).toBe(source);
  expect(await version(root, "brain")).toBe("0.2.0-alpha.7");
  expect((await run(root, "release-lane.ts", "check")).exit).toBe(0);
  expect(
    (await readdir(root)).filter((name) =>
      name.startsWith(".release-lane-stash-"),
    ),
  ).toEqual([]);
});

test.each(["core", "site"])(
  "%s publication callback scopes packages and restores all manifests (no publisher invoked)",
  async (lane) => {
    const root = await fixture();
    const originals = await Promise.all(
      ["brain", "ops", "site", "core", "lib", "client"].map((name) =>
        readFile(join(root, "packages", name, "package.json"), "utf8"),
      ),
    );
    await writeFile(
      join(root, "record-scope.ts"),
      `import { getPackages } from "@manypkg/get-packages"; const p = await getPackages(process.cwd()); await Bun.write("scope.json", JSON.stringify(p.packages.filter(x => !x.packageJson.private).map(x => x.packageJson.name).sort()));\n`,
    );
    expect((await run(root, "publish-packages.ts", lane)).exit).toBe(0);
    const selected: string[] = JSON.parse(
      await readFile(join(root, "scope.json"), "utf8"),
    );
    expect(selected).toEqual(
      lane === "site"
        ? ["@rizom/site-fixture"]
        : ["@rizom/brain", "@rizom/ops", "peer-client", "peer-lib"],
    );
    expect(
      await Promise.all(
        ["brain", "ops", "site", "core", "lib", "client"].map((name) =>
          readFile(join(root, "packages", name, "package.json"), "utf8"),
        ),
      ),
    ).toEqual(originals);
  },
);

test("actual Node CLI uses the policy patch, not merely the Bun planner", async () => {
  const root = await fixture();
  await rm(join(root, ".changeset", "pre.json"));
  for (const name of [
    "core--past",
    "site--past",
    "core--fresh",
    "site--fresh",
  ]) {
    await rm(join(root, ".changeset", `${name}.md`));
  }
  await writeFile(
    join(root, ".changeset", "core--peer.md"),
    '---\n"peer-lib": minor\n---\n\nKeep the reviewed peer bump policy.\n',
  );
  expect((await run(root, "release-lane.ts", "version", "core")).exit).toBe(0);
  expect(await version(root, "lib")).toBe("1.1.0");
  expect(await version(root, "client")).toBe("2.0.0");
});

test.each([true, false])(
  "legacy out-of-range option=%s retains its peer behavior",
  async (onlyOutOfRange) => {
    const root = await fixture();
    const packages = await getPackages(root);
    const result = await readConfig(root, packages);
    if (result.config === undefined) throw new Error(result.errors.join("\n"));
    result.config.___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH.onlyUpdatePeerDependentsWhenOutOfRange =
      onlyOutOfRange;
    const plan = assembleReleasePlan(
      [
        {
          id: "peer-option",
          summary: "Existing option semantics.",
          releases: [{ name: "peer-lib", type: "minor" }],
        },
      ],
      packages,
      result.config,
      undefined,
    );
    expect(
      plan.releases.find((release) => release.name === "peer-client")?.type,
    ).toBe(onlyOutOfRange ? undefined : "major");
  },
);

test.each(["patch", "minor", "major"] as const)(
  "installed policy patch preserves the legacy %s peer-dependent bump",
  async (type) => {
    const root = await fixture();
    const packages = await getPackages(root);
    const result = await readConfig(root, packages);
    if (result.config === undefined) throw new Error(result.errors.join("\n"));
    const plan = assembleReleasePlan(
      [
        {
          id: "policy-control",
          summary: "Legacy peer bump policy.",
          releases: [{ name: "peer-lib", type }],
        },
      ],
      packages,
      result.config,
      undefined,
    );
    const client = plan.releases.find(
      (release) => release.name === "peer-client",
    );
    expect(client?.type).toBe(type === "patch" ? undefined : "major");
    if (type !== "patch") expect(client?.newVersion).toBe("2.0.0");
  },
);
