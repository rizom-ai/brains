import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { preparePublishManifest } from "@brains/build-tools";

const packageDir = join(import.meta.dir, "..");
const basePackageDir = join(packageDir, "../rizom");
const sdkPackageDir = join(packageDir, "../../packages/site");

async function run(command: string[], cwd: string): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${command.join(" ")}`,
        `cwd: ${cwd}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }

  return stdout;
}

async function findPackedTarball(
  packDir: string,
  packagePrefix: string,
): Promise<string> {
  const entries = await readdir(packDir);
  // Require a version digit right after the prefix so the base package
  // prefix cannot match the work package tarball.
  const tarball = entries.find(
    (entry) =>
      entry.startsWith(packagePrefix) &&
      /^\d/.test(entry.slice(packagePrefix.length)) &&
      entry.endsWith(".tgz"),
  );

  if (!tarball) {
    throw new Error(`Missing packed tarball with prefix ${packagePrefix}`);
  }

  return join(packDir, tarball);
}

/**
 * Copy a package dir and apply the same manifest transform the real
 * publish runs via prepack. Packing from a copy keeps the live
 * manifests untouched while parallel workspace tasks run; stripping
 * the lifecycle scripts stops bun pm pack from re-running the
 * transform inside the copy (where the publish-manifest bin does not
 * exist).
 */
async function stagePublishableCopy(
  sourceDir: string,
  destinationDir: string,
): Promise<void> {
  await cp(sourceDir, destinationDir, {
    recursive: true,
    filter: (source) =>
      !source.includes("node_modules") && !source.includes(".turbo"),
  });
  await preparePublishManifest(destinationDir, { resolveFrom: sourceDir });

  const manifestPath = join(destinationDir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.scripts?.prepack;
  delete manifest.scripts?.postpack;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe("@rizom/site-rizom-work package boundary", () => {
  test("publishable manifests install and import cleanly from packed tarballs", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "site-rizom-work-pack-"));

    try {
      const sdkCopyDir = join(tempDir, "sdk-copy");
      const baseCopyDir = join(tempDir, "base-copy");
      const workCopyDir = join(tempDir, "work-copy");
      await stagePublishableCopy(sdkPackageDir, sdkCopyDir);
      await stagePublishableCopy(basePackageDir, baseCopyDir);
      await stagePublishableCopy(packageDir, workCopyDir);

      await run(
        ["bun", "pm", "pack", "--destination", tempDir, "--quiet"],
        sdkCopyDir,
      );
      await run(
        ["bun", "pm", "pack", "--destination", tempDir, "--quiet"],
        baseCopyDir,
      );
      await run(
        ["bun", "pm", "pack", "--destination", tempDir, "--quiet"],
        workCopyDir,
      );

      const sdkTarball = await findPackedTarball(tempDir, "rizom-site-");
      const baseTarball = await findPackedTarball(tempDir, "rizom-site-rizom-");
      const workTarball = await findPackedTarball(
        tempDir,
        "rizom-site-rizom-work-",
      );

      const brainPeerDir = join(tempDir, "brain-peer");
      await mkdir(brainPeerDir);
      await writeFile(
        join(brainPeerDir, "package.json"),
        JSON.stringify({ name: "@rizom/brain", version: "0.2.0-alpha.136" }),
      );

      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            type: "module",
            dependencies: {
              "@rizom/brain": `file:${brainPeerDir}`,
              "@rizom/site-rizom-work": `file:${workTarball}`,
            },
            overrides: {
              "@rizom/site": `file:${sdkTarball}`,
              "@rizom/site-rizom": `file:${baseTarball}`,
            },
          },
          null,
          2,
        ),
      );

      await run(["bun", "install"], tempDir);

      const output = await run(
        [
          "bun",
          "-e",
          'const site = await import("@rizom/site-rizom-work"); console.log(site.default.routes[0].id)',
        ],
        tempDir,
      );

      expect(output.trim()).toBe("home");

      const sourceBaseManifest = JSON.parse(
        await readFile(join(basePackageDir, "package.json"), "utf8"),
      );
      const sourceWorkManifest = JSON.parse(
        await readFile(join(packageDir, "package.json"), "utf8"),
      );
      const sourceSdkManifest = JSON.parse(
        await readFile(join(sdkPackageDir, "package.json"), "utf8"),
      );
      const installedBaseManifest = JSON.parse(
        await readFile(
          join(tempDir, "node_modules/@rizom/site-rizom/package.json"),
          "utf8",
        ),
      );
      const installedWorkManifest = JSON.parse(
        await readFile(
          join(tempDir, "node_modules/@rizom/site-rizom-work/package.json"),
          "utf8",
        ),
      );

      // The workspace protocol must not survive into a publishable
      // manifest: npm publish (used by the release flow) does not
      // rewrite it, so the transform has to.
      expect(JSON.stringify(installedWorkManifest)).not.toContain("workspace:");
      expect(installedWorkManifest.dependencies["@rizom/site"]).toBe(
        sourceSdkManifest.version,
      );
      expect(installedWorkManifest.dependencies["@rizom/site-rizom"]).toBe(
        sourceBaseManifest.version,
      );
      expect(installedBaseManifest.dependencies["@rizom/site"]).toBe(
        sourceSdkManifest.version,
      );
      expect(installedWorkManifest.devDependencies).toBeUndefined();

      // The runtime peer range must reach the published manifest even
      // though the repo manifest omits it (it would close a workspace
      // dependency cycle through @rizom/brain).
      expect(sourceBaseManifest.peerDependencies).toBeUndefined();
      expect(installedBaseManifest.peerDependencies).toEqual(
        sourceBaseManifest.publishPeerDependencies,
      );
      expect(
        installedBaseManifest.peerDependencies?.["@rizom/brain"],
      ).toBeDefined();

      // The in-repo "bun" source export condition must not ship: the
      // published artifact resolves to dist only.
      expect(sourceWorkManifest.scripts.prepack).toBe(
        "publish-manifest prepare",
      );
      expect(JSON.stringify(installedBaseManifest.exports)).not.toContain(
        "src/",
      );
      expect(installedBaseManifest.publishExports).toBeUndefined();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 20_000);
});
