import assembleReleasePlan from "@changesets/assemble-release-plan";
import { read as readChangesetsConfig } from "@changesets/config";
import { getPackages } from "@manypkg/get-packages";
import { expect, test } from "bun:test";
import { join } from "node:path";

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

function isPublicSiteOrTheme(name: string): boolean {
  return name.startsWith("@rizom/site") || name.startsWith("@rizom/theme");
}

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
      "@rizom/site-smoke-canary",
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
});

test("public site and theme packages release independently", async () => {
  const siteRelease = await releasedPackagesFor("@rizom/site-smoke-canary");
  expect([...siteRelease].filter(isPublicSiteOrTheme)).toEqual([
    "@rizom/site-smoke-canary",
  ]);
  expect(siteRelease.has("@rizom/brain")).toBe(false);

  const themeRelease = await releasedPackagesFor("@rizom/theme-signal");
  expect([...themeRelease].filter(isPublicSiteOrTheme)).toEqual([
    "@rizom/theme-signal",
  ]);
  expect(themeRelease.has("@rizom/brain")).toBe(false);
});

test("brain-only changes do not version public site or theme packages", async () => {
  const releases = await releasedPackagesFor("@rizom/brain");

  expect([...releases].filter(isPublicSiteOrTheme)).toEqual([]);
  expect(releases.has("@brains/core")).toBe(true);
  expect(releases.has("@rizom/ops")).toBe(true);
});

test("normal dependency propagation still applies across release groups", async () => {
  const releases = await releasedPackagesFor("@rizom/theme-default");

  expect(releases.has("@rizom/theme-default")).toBe(true);
  expect(releases.has("@rizom/theme-rizom-ai")).toBe(true);
  expect(releases.has("@rizom/theme-signal")).toBe(true);
});
