import assembleReleasePlan from "@changesets/assemble-release-plan";
import { read as readChangesetsConfig } from "@changesets/config";
import { getPackages } from "@manypkg/get-packages";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReleasePlanMatchesLane,
  isSiteReleasePackage,
  runWithScopedReleasePackages,
} from "../src/release-lanes";

const repositoryRoot = join(import.meta.dir, "../../..");

async function releasedPackagesFor(name: string): Promise<Set<string>> {
  const packages = await getPackages(repositoryRoot);
  const config = await readChangesetsConfig(repositoryRoot, packages);
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

  return new Set(
    plan.releases
      .filter((release) => release.type !== "none")
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
      "@rizom/site-rizom-foundation",
      "@rizom/site-rizom-work",
      "@rizom/theme-default",
      "@rizom/theme-rizom-ai",
      "@rizom/theme-signal",
    ],
  );
  for (const { packageJson } of deployablePackages) {
    const manifest = packageJson as Record<string, unknown>;
    const peers = manifest["publishPeerDependencies"] as
      Record<string, unknown> | undefined;
    expect(peers?.["@rizom/brain"]).toBeString();
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
  const siteRelease = await releasedPackagesFor("@rizom/site-docs");
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

  const themeRelease = await releasedPackagesFor("@rizom/theme-signal");
  expect([...themeRelease].filter(isPublicSiteOrTheme)).toEqual([
    "@rizom/theme-signal",
  ]);
  expect(() =>
    assertReleasePlanMatchesLane(
      "site",
      [...themeRelease].map((name) => ({ name })),
    ),
  ).not.toThrow();
  expect(themeRelease.has("@rizom/brain")).toBe(false);
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

test("release lane guard rejects core/site plan crossover", () => {
  expect(() =>
    assertReleasePlanMatchesLane("core", [
      { name: "@rizom/brain" },
      { name: "@rizom/site-rizom" },
    ]),
  ).toThrow("@rizom/site-rizom");
  expect(() =>
    assertReleasePlanMatchesLane("site", [
      { name: "@rizom/theme-signal" },
      { name: "@brains/core" },
      { name: "@rizom/brain" },
    ]),
  ).toThrow("@brains/core, @rizom/brain");
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
  expect(releases.has("@rizom/theme-signal")).toBe(true);
});
