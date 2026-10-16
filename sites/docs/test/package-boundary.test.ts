import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  installPackedConsumer,
  packPublishable,
  packedSiteEvidenceEnabled,
  publishManifestFor,
  runCommand,
  workspaceCopy,
} from "@brains/build-tools";

const packageDir = join(import.meta.dir, "..");
const sdkPackageDir = join(packageDir, "../../packages/site");
const repoRoot = join(packageDir, "../..");

async function readSourceManifest(dir: string): Promise<{
  version: string;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  publishPeerDependencies?: Record<string, string>;
  scripts: Record<string, string>;
}> {
  return JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
}

describe("@rizom/site-docs package boundary", () => {
  test("publishes a manifest that pins @rizom deps and ships its runtime peer", async () => {
    const source = await readSourceManifest(packageDir);
    const sdk = await readSourceManifest(sdkPackageDir);
    const published = await publishManifestFor(packageDir);

    expect(JSON.stringify(published)).not.toContain("workspace:");
    expect(published["dependencies"]).toMatchObject({
      "@rizom/site": sdk.version,
    });
    expect(published["dependencies"]).not.toHaveProperty("@rizom/site-rizom");
    expect(published).not.toHaveProperty("devDependencies");

    // npm builds the registry dependency metadata from the on-disk
    // manifest before prepack rewrites it, so a workspace: range here
    // ships a broken packument even when the tarball manifest is
    // clean (@rizom/site-rizom-ai@0.2.0-alpha.145). The repo manifest
    // must pin the concrete version of published @rizom deps.
    expect(source.dependencies["@rizom/site"]).toBe(sdk.version);
    expect(source.dependencies).not.toHaveProperty("@rizom/site-rizom");

    // The runtime peer range must reach the published manifest even
    // though the repo manifest omits it (it would close a workspace
    // dependency cycle through @rizom/brain).
    expect(source.peerDependencies).toBeUndefined();
    expect(published["peerDependencies"]).toEqual(
      source.publishPeerDependencies,
    );
    expect(published["peerDependencies"]).toHaveProperty("@rizom/brain");
  });

  // Installs real tarballs, so it runs in the packed site evidence step
  // (bun run test:packed:sites), not in every workspace test run.
  test.skipIf(!packedSiteEvidenceEnabled())(
    "installs from packed tarballs and imports cleanly",
    async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "site-docs-pack-"));
      try {
        const sdkTarball = await packPublishable(sdkPackageDir, tempDir);
        const siteTarball = await packPublishable(packageDir, tempDir);
        const brainPeerDir = join(tempDir, "brain-peer");
        await mkdir(brainPeerDir);
        await writeFile(
          join(brainPeerDir, "package.json"),
          JSON.stringify({ name: "@rizom/brain", version: "0.2.0-alpha.136" }),
        );
        const consumerDir = join(tempDir, "consumer");
        await mkdir(consumerDir);
        // Third-party deps come from the workspace install, so the test
        // does not depend on the registry; the @rizom/* packages stay on
        // tarballs, which is what is under test.
        await installPackedConsumer(consumerDir, {
          dependencies: {
            "@rizom/brain": `file:${brainPeerDir}`,
            "@rizom/site-docs": `file:${siteTarball}`,
            react: workspaceCopy(repoRoot, "react"),
            "react-dom": workspaceCopy(repoRoot, "react-dom"),
          },
          overrides: {
            "@rizom/site": `file:${sdkTarball}`,
            react: workspaceCopy(repoRoot, "react"),
            "react-dom": workspaceCopy(repoRoot, "react-dom"),
          },
        });

        const output = await runCommand(
          [
            "bun",
            "-e",
            'const site = await import("@rizom/site-docs"); console.log(site.default.routes.map((route) => route.id).join(","))',
          ],
          consumerDir,
        );
        expect(output.trim()).toBe("docs-home,docs");

        // The tarball carries the manifest the fast check inspects.
        const installed = JSON.parse(
          await readFile(
            join(consumerDir, "node_modules/@rizom/site-docs/package.json"),
            "utf8",
          ),
        );
        const published = await publishManifestFor(packageDir);
        expect(installed.dependencies).toEqual(published["dependencies"]);
        expect(installed.peerDependencies).toEqual(
          published["peerDependencies"],
        );
        expect(installed.exports).toEqual(published["exports"]);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
