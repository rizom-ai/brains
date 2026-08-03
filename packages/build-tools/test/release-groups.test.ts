import assembleReleasePlan from "@changesets/assemble-release-plan";
import { read as readChangesetsConfig } from "@changesets/config";
import { getPackages } from "@manypkg/get-packages";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCoordinatedStableReleasePlan,
  assertReleasePlanMatchesLane,
  inferReleaseLane,
  isSiteReleasePackage,
  resolveReleaseVersionStrategy,
  resolveReleaseWorkflowMode,
  runWithScopedReleasePackages,
} from "../src/release-lanes";

const repositoryRoot = join(import.meta.dir, "../../..");

async function releasePlanFor(
  name: string,
): Promise<{ name: string; private: boolean }[]> {
  const packages = await getPackages(repositoryRoot);
  const config = await readChangesetsConfig(repositoryRoot, packages);
  const privatePackages = new Set(
    packages.packages
      .filter(({ packageJson }) => packageJson.private === true)
      .map(({ packageJson }) => packageJson.name),
  );
  const plan = assembleReleasePlan(
    [
      {
        id: "release-group-test",
        summary: "Validate the independent release groups.",
        releases: [{ name, type: "patch" }],
      },
    ],
    packages,
    config,
    undefined,
  );

  return plan.releases
    .filter((release) => release.type !== "none")
    .map((release) => ({
      name: release.name,
      private: privatePackages.has(release.name),
    }));
}

async function releasedPackagesFor(name: string): Promise<Set<string>> {
  return new Set((await releasePlanFor(name)).map((release) => release.name));
}

async function publishedPackagesFor(name: string): Promise<Set<string>> {
  return new Set(
    (await releasePlanFor(name))
      .filter((release) => !release.private)
      .map((release) => release.name),
  );
}

const isPublicSiteOrTheme = isSiteReleasePackage;

test("deployable site and theme inventory declares brain compatibility", async () => {
  const packages = await getPackages(repositoryRoot);
  const deployablePackages = packages.packages
    .filter(({ packageJson }) => {
      const scripts = (packageJson as { scripts?: Record<string, string> })
        .scripts;
      return (
        packageJson.private !== true &&
        scripts?.["prepack"] === "publish-manifest prepare" &&
        (packageJson.name.startsWith("@rizom/site-") ||
          packageJson.name.startsWith("@rizom/theme-"))
      );
    })
    .sort((a, b) => a.packageJson.name.localeCompare(b.packageJson.name));

  expect(deployablePackages.map(({ packageJson }) => packageJson.name)).toEqual(
    [
      "@rizom/site-docs",
      "@rizom/site-rizom",
      "@rizom/site-rizom-ai",
      "@rizom/theme-default",
      "@rizom/theme-rizom-ai",
    ],
  );
  for (const { packageJson } of deployablePackages) {
    const manifest = packageJson as Record<string, unknown>;
    const peers = manifest["publishPeerDependencies"] as
      Record<string, unknown> | undefined;
    expect(peers?.["@rizom/brain"]).toBeString();

    // The external authoring contract (docs/external-site-authoring.md) has
    // the host runtime provide preact; a site that ships it as a hard
    // dependency installs a second preact instance next to the host's.
    if (packageJson.name.startsWith("@rizom/site-")) {
      const dependencies = manifest["dependencies"] as
        Record<string, unknown> | undefined;
      expect(peers?.["preact"]).toBeString();
      expect(dependencies?.["preact"]).toBeUndefined();
    }
  }

  const extractedCanary = packages.packages.find(
    ({ packageJson }) => packageJson.name === "@rizom/site-smoke-canary",
  )?.packageJson as Record<string, unknown> | undefined;
  expect(extractedCanary?.["private"]).toBe(true);
  expect(extractedCanary?.["scripts"]).toBeUndefined();
  expect(
    (extractedCanary?.["repository"] as Record<string, unknown> | undefined)?.[
      "url"
    ],
  ).toBe("git+https://github.com/rizom-ai/site-smoke-canary.git");
});

test("public packages do not depend on private workspace packages", async () => {
  const packages = await getPackages(repositoryRoot);
  const privateNames = new Set(
    packages.packages
      .filter(({ packageJson }) => packageJson.private === true)
      .map(({ packageJson }) => packageJson.name),
  );
  const offenders = packages.packages
    .filter(({ packageJson }) => packageJson.private !== true)
    .flatMap(({ packageJson }) => {
      const manifest = packageJson as Record<string, unknown>;
      return [
        "dependencies",
        "peerDependencies",
        "optionalDependencies",
      ].flatMap((field) => {
        const dependencies = manifest[field] as
          Record<string, string> | undefined;
        return Object.keys(dependencies ?? {})
          .filter((name) => privateNames.has(name))
          .map((name) => `${packageJson.name} ${field} ${name}`);
      });
    })
    .sort();

  expect(offenders).toEqual([]);
});

test("publishable packages do not restore their manifest mid-publish", async () => {
  // npm derives the registry packument from the on-disk package.json AFTER
  // postpack runs, while the tarball is packed from the prepared manifest. A
  // `postpack: publish-manifest restore` therefore ships a correct tarball with
  // a broken packument (authoring-only fields retained, workspace: ranges
  // unresolved) — the alpha.144/145 and alpha.231/232 failures. Restoring is
  // the release wrapper's job (runWithPreparedPublishManifests), once, after
  // the whole publish completes.
  const packages = await getPackages(repositoryRoot);
  const offenders = packages.packages
    .filter(({ packageJson }) => {
      const scripts = (packageJson as { scripts?: Record<string, string> })
        .scripts;
      return (
        packageJson.private !== true &&
        scripts?.["postpack"]?.startsWith("publish-manifest restore") === true
      );
    })
    .map(({ packageJson }) => packageJson.name);

  expect(offenders).toEqual([]);
});

test("public site and theme packages release independently", async () => {
  const siteRelease = await publishedPackagesFor("@rizom/site-docs");
  expect([...siteRelease].filter(isPublicSiteOrTheme)).toEqual([
    "@rizom/site-docs",
  ]);
  expect(() =>
    assertReleasePlanMatchesLane(
      "site",
      [...siteRelease].map((name) => ({ name })),
    ),
  ).not.toThrow();
  expect(siteRelease.has("@rizom/brain")).toBe(false);

  const themeRelease = await publishedPackagesFor("@rizom/theme-rizom-ai");
  expect([...themeRelease].filter(isPublicSiteOrTheme)).toEqual([
    "@rizom/theme-rizom-ai",
  ]);
  expect(() =>
    assertReleasePlanMatchesLane(
      "site",
      [...themeRelease].map((name) => ({ name })),
    ),
  ).not.toThrow();
  expect(themeRelease.has("@rizom/brain")).toBe(false);
});

test("a site release with private dependents stays out of the fixed core group", async () => {
  // @rizom/site-rizom is runtime-depended on by the private relay and ranger
  // apps. Their version bumps are npm-invisible bookkeeping and are allowed in
  // the site release plan — but they must not drag the fixed core group in,
  // which is the bridge that used to turn every site fix into a full core
  // release.
  const plan = await releasePlanFor("@rizom/site-rizom");
  const published = plan
    .filter((release) => !release.private)
    .map((release) => release.name)
    .sort();
  expect(published).toEqual(["@rizom/site-rizom", "@rizom/site-rizom-ai"]);
  expect(() => assertReleasePlanMatchesLane("site", plan)).not.toThrow();

  const packages = await getPackages(repositoryRoot);
  const config = await readChangesetsConfig(repositoryRoot, packages);
  const fixedPackages = new Set(config.fixed.flat());
  expect(
    plan.map((release) => release.name).filter((n) => fixedPackages.has(n)),
  ).toEqual([]);
});

test("fixed release group packages never depend on the site lane", async () => {
  // A fixed-group package with a bump-propagating dependency on a site or
  // theme package re-arms the site→core release bridge, whether the package
  // itself is public or not. Type-only usage belongs in devDependencies.
  const packages = await getPackages(repositoryRoot);
  const config = await readChangesetsConfig(repositoryRoot, packages);
  const fixedPackages = new Set(config.fixed.flat());
  const offenders: string[] = [];

  for (const { packageJson } of packages.packages) {
    if (!fixedPackages.has(packageJson.name)) {
      continue;
    }
    const manifest = packageJson as Record<string, unknown>;
    for (const field of ["dependencies", "peerDependencies"] as const) {
      const deps = manifest[field] as Record<string, string> | undefined;
      for (const dependencyName of Object.keys(deps ?? {})) {
        if (isSiteReleasePackage(dependencyName)) {
          offenders.push(`${packageJson.name} ${field} ${dependencyName}`);
        }
      }
    }
  }

  expect(offenders).toEqual([]);
});

test("brain-only changes do not version public site or theme packages", async () => {
  const releases = await releasedPackagesFor("@rizom/brain");

  expect([...releases].filter(isPublicSiteOrTheme)).toEqual([]);
  expect(() =>
    assertReleasePlanMatchesLane(
      "core",
      [...releases].map((name) => ({ name })),
    ),
  ).not.toThrow();
  expect(releases.has("@brains/core")).toBe(true);
  expect(releases.has("@rizom/ops")).toBe(true);
});

test("release lane is inferred from a changeset's own packages", () => {
  expect(
    inferReleaseLane([
      { name: "@rizom/site-rizom" },
      { name: "@rizom/theme-rizom-ai" },
    ]),
  ).toBe("site");
  expect(
    inferReleaseLane([{ name: "@brains/core" }, { name: "@rizom/brain" }]),
  ).toBe("core");
  expect(() => inferReleaseLane([])).toThrow(
    "Cannot infer a release lane from a changeset without packages",
  );
  expect(() =>
    inferReleaseLane([{ name: "@rizom/brain" }, { name: "@rizom/site-rizom" }]),
  ).toThrow("core (@rizom/brain) and site (@rizom/site-rizom)");
});

test("release lane guard rejects core/site plan crossover", () => {
  expect(() =>
    assertReleasePlanMatchesLane("core", [
      { name: "@rizom/brain" },
      { name: "@rizom/site-rizom" },
    ]),
  ).toThrow("@rizom/site-rizom");
  expect(() =>
    assertReleasePlanMatchesLane("site", [
      { name: "@rizom/theme-rizom-ai" },
      { name: "@brains/core" },
      { name: "@rizom/brain" },
    ]),
  ).toThrow("@brains/core, @rizom/brain");
  // Private packages can never be published, so their version bumps are
  // allowed to ride along in either lane's plan.
  expect(() =>
    assertReleasePlanMatchesLane("site", [
      { name: "@rizom/site-rizom" },
      { name: "@brains/relay", private: true },
    ]),
  ).not.toThrow();
});

test("stable prerelease exit is versioned globally by the core lane", () => {
  expect(resolveReleaseVersionStrategy("core", "exit")).toBe("stable");
  expect(resolveReleaseVersionStrategy("site", "exit")).toBe("defer");
  expect(resolveReleaseVersionStrategy("core", "pre")).toBe("lane");
  expect(resolveReleaseVersionStrategy("site", undefined)).toBe("lane");

  expect(resolveReleaseWorkflowMode("exit", "pre")).toBe("stable-exit");
  expect(resolveReleaseWorkflowMode(undefined, "exit")).toBe("stable-version");
  expect(resolveReleaseWorkflowMode("pre", "pre")).toBe("standard");
  expect(resolveReleaseWorkflowMode(undefined, undefined)).toBe("standard");
});

test("coordinated stable plan accepts both lanes but only stable versions", () => {
  expect(() =>
    assertCoordinatedStableReleasePlan([
      { name: "@rizom/brain", type: "minor", newVersion: "0.2.0" },
      {
        name: "@rizom/site-rizom",
        type: "patch",
        newVersion: "0.2.0",
      },
      {
        name: "private-fixture",
        type: "patch",
        private: true,
        newVersion: "0.2.0-alpha.1",
      },
    ]),
  ).not.toThrow();
  expect(() =>
    assertCoordinatedStableReleasePlan([
      {
        name: "@rizom/brain",
        type: "minor",
        newVersion: "0.2.0-alpha.240",
      },
    ]),
  ).toThrow("@rizom/brain@0.2.0-alpha.240");
  expect(() => assertCoordinatedStableReleasePlan([])).toThrow(
    "produced no public package releases",
  );
});

test("publish scope restores opposite-lane manifests after failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "release-lane-scope-"));
  const coreDir = join(dir, "core");
  const siteDir = join(dir, "site");
  await Promise.all([
    mkdir(coreDir, { recursive: true }),
    mkdir(siteDir, { recursive: true }),
  ]);
  const coreManifest = '{\n  "name": "@rizom/brain"\n}\n';
  const siteManifest = '{\n  "name": "@rizom/site-example"\n}\n';
  await writeFile(join(coreDir, "package.json"), coreManifest);
  await writeFile(join(siteDir, "package.json"), siteManifest);

  try {
    let publishError: unknown;
    try {
      await runWithScopedReleasePackages(
        [
          { dir: coreDir, packageJson: { name: "@rizom/brain" } },
          { dir: siteDir, packageJson: { name: "@rizom/site-example" } },
        ],
        "site",
        async () => {
          const hidden = JSON.parse(
            await readFile(join(coreDir, "package.json"), "utf8"),
          ) as Record<string, unknown>;
          expect(hidden["private"]).toBe(true);
          throw new Error("publish failed");
        },
      );
    } catch (error) {
      publishError = error;
    }
    expect(publishError).toBeInstanceOf(Error);
    expect((publishError as Error).message).toBe("publish failed");
    expect(await readFile(join(coreDir, "package.json"), "utf8")).toBe(
      coreManifest,
    );
    expect(await readFile(join(siteDir, "package.json"), "utf8")).toBe(
      siteManifest,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("normal dependency propagation still applies across release groups", async () => {
  const releases = await releasedPackagesFor("@rizom/theme-default");

  expect(releases.has("@rizom/theme-default")).toBe(true);
  expect(releases.has("@rizom/theme-rizom-ai")).toBe(true);
});
