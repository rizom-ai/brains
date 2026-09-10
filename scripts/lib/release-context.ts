import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import {
  resolveReleaseWorkflowMode,
  type ReleaseWorkflowMode,
} from "@brains/build-tools";

const preSchema = z.object({ mode: z.enum(["pre", "exit"]) });
const versionSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u),
});
const alphaSchema = z.string().regex(/^0\.2\.0-alpha\.\d+$/u);

export interface ReleaseContext {
  readonly mode: ReleaseWorkflowMode;
  readonly brain_candidate_version?: string;
}

async function publishedBrainVersion(version: string): Promise<boolean> {
  const response = await fetch(
    `https://registry.npmjs.org/@rizom%2fbrain/${encodeURIComponent(version)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (response.status === 404) return false;
  if (!response.ok)
    throw new Error(
      `Cannot verify completed graduation: npm returned ${response.status}`,
    );
  return versionSchema.parse(await response.json()).version === version;
}

/** Git history records provenance; npm records whether graduation completed. */
export async function readReleaseContext(
  root: string,
  isPublished: (version: string) => Promise<boolean> = publishedBrainVersion,
): Promise<ReleaseContext> {
  async function git(...args: string[]): Promise<string> {
    const child = Bun.spawn(["git", ...args], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0)
      throw new Error(`Cannot establish release provenance: ${stderr.trim()}`);
    return stdout.trim();
  }
  const currentVersion = versionSchema.parse(
    JSON.parse(
      await readFile(join(root, "packages/brain-cli/package.json"), "utf8"),
    ),
  ).version;
  let currentMode: "pre" | "exit" | undefined;
  try {
    currentMode = preSchema.parse(
      JSON.parse(await readFile(join(root, ".changeset/pre.json"), "utf8")),
    ).mode;
  } catch (error) {
    if (
      error === null ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
  if (currentMode) {
    return {
      mode: resolveReleaseWorkflowMode(currentMode, false),
      ...(currentMode === "exit"
        ? { brain_candidate_version: alphaSchema.parse(currentVersion) }
        : {}),
    };
  }
  const versionCommit = await git(
    "log",
    "-1",
    "--format=%H",
    "--diff-filter=D",
    "--",
    ".changeset/pre.json",
  );
  if (!/^[a-f0-9]{40}$/u.test(versionCommit)) {
    throw new Error(
      "Cannot establish release provenance: fetch complete history containing the stable version commit",
    );
  }
  const priorMode = preSchema.parse(
    JSON.parse(await git("show", `${versionCommit}^:.changeset/pre.json`)),
  ).mode;
  const stableVersion = versionSchema.parse(
    JSON.parse(
      await git("show", `${versionCommit}:packages/brain-cli/package.json`),
    ),
  ).version;
  if (priorMode !== "exit" || stableVersion.includes("-")) {
    throw new Error(
      "Cannot establish release provenance: prerelease removal was not a coordinated stable version commit",
    );
  }
  const mode = resolveReleaseWorkflowMode(
    undefined,
    currentVersion === stableVersion && !(await isPublished(stableVersion)),
  );
  return {
    mode,
    ...(mode === "stable-version"
      ? {
          brain_candidate_version: alphaSchema.parse(
            versionSchema.parse(
              JSON.parse(
                await git(
                  "show",
                  `${versionCommit}^:packages/brain-cli/package.json`,
                ),
              ),
            ).version,
          ),
        }
      : {}),
  };
}
