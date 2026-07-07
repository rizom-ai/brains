import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { preparePublishManifest } from "@brains/build-tools";

const packageDir = join(import.meta.dir, "..");
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

describe("@rizom/site-docs package boundary", () => {
  test("publishable manifest installs and imports cleanly from packed tarballs", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "site-docs-pack-"));

    try {
      const sdkCopyDir = join(tempDir, "sdk-copy");
      const docsCopyDir = join(tempDir, "docs-copy");
      await stagePublishableCopy(sdkPackageDir, sdkCopyDir);
      await stagePublishableCopy(packageDir, docsCopyDir);

      await run(
        ["bun", "pm", "pack", "--destination", tempDir, "--quiet"],
        sdkCopyDir,
      );
      await run(
        ["bun", "pm", "pack", "--destination", tempDir, "--quiet"],
        docsCopyDir,
      );

      const sdkTarball = await findPackedTarball(tempDir, "rizom-site-");
      const docsTarball = await findPackedTarball(tempDir, "rizom-site-docs-");

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
              "@rizom/site-docs": `file:${docsTarball}`,
              preact: "^10.27.2",
            },
            overrides: {
              "@rizom/site": `file:${sdkTarball}`,
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
          'const site = await import("@rizom/site-docs"); console.log(site.default.routes.map((route) => route.id).join(","))',
        ],
        tempDir,
      );

      expect(output.trim()).toBe("docs-home,docs");

      const sourceDocsManifest = JSON.parse(
        await readFile(join(packageDir, "package.json"), "utf8"),
      );
      const sourceSdkManifest = JSON.parse(
        await readFile(join(sdkPackageDir, "package.json"), "utf8"),
      );
      const installedDocsManifest = JSON.parse(
        await readFile(
          join(tempDir, "node_modules/@rizom/site-docs/package.json"),
          "utf8",
        ),
      );

      expect(JSON.stringify(installedDocsManifest)).not.toContain("workspace:");
      expect(installedDocsManifest.dependencies["@rizom/site"]).toBe(
        sourceSdkManifest.version,
      );
      expect(installedDocsManifest.dependencies).not.toHaveProperty(
        "@rizom/site-rizom",
      );
      expect(installedDocsManifest.devDependencies).toBeUndefined();
      expect(sourceDocsManifest.peerDependencies).toBeUndefined();
      expect(installedDocsManifest.peerDependencies).toEqual(
        sourceDocsManifest.publishPeerDependencies,
      );
      expect(
        installedDocsManifest.peerDependencies?.["@rizom/brain"],
      ).toBeDefined();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 20_000);
});
