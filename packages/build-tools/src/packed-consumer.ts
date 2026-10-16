import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { preparePublishManifest } from "./publish-manifest";

/**
 * Packed-tarball evidence installs real packages, so it runs as its own CI
 * step rather than in every workspace test run, where it competes with
 * parallel installs for the Bun cache.
 */
export const PACKED_SITE_EVIDENCE_ENV = "PACKED_SITE_EVIDENCE";

export function packedSiteEvidenceEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[PACKED_SITE_EVIDENCE_ENV] === "1";
}

/** Run a command and return its stdout; a failure carries both streams. */
export async function runCommand(
  command: readonly string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<string> {
  const subprocess = Bun.spawn([...command], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
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

/**
 * Pack a package the way its publish does: from a copy with the publish
 * manifest applied, so live manifests stay untouched while other workspace
 * tasks run. Returns the tarball path in `destination`.
 */
export async function packPublishable(
  packageDir: string,
  destination: string,
): Promise<string> {
  const copyDir = join(destination, `${basename(packageDir)}-copy`);
  await cp(packageDir, copyDir, {
    recursive: true,
    filter: (source) =>
      !source.includes("node_modules") && !source.includes(".turbo"),
  });
  await preparePublishManifest(copyDir, { resolveFrom: packageDir });
  // The copy already carries the prepared manifest; prepack would re-run
  // the transform where the publish-manifest bin does not exist.
  const manifestPath = join(copyDir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.scripts?.prepack;
  delete manifest.scripts?.postpack;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const before = new Set(await readdir(destination));
  await runCommand(
    ["bun", "pm", "pack", "--destination", destination, "--quiet"],
    copyDir,
  );
  const tarball = (await readdir(destination)).find(
    (entry) => !before.has(entry) && entry.endsWith(".tgz"),
  );
  if (!tarball) throw new Error(`Packing ${packageDir} produced no tarball`);
  return join(destination, tarball);
}

/** A dependency resolved from the workspace's own install, not the registry. */
export function workspaceCopy(repoRoot: string, name: string): string {
  return `file:${join(repoRoot, "node_modules", name)}`;
}

/** Install a consumer project in `dir` from the given dependency map. */
export async function installPackedConsumer(
  dir: string,
  manifest: {
    dependencies: Record<string, string>;
    overrides?: Record<string, string>;
  },
): Promise<void> {
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ type: "module", ...manifest }, null, 2),
  );
  await runCommand(["bun", "install"], dir);
}
