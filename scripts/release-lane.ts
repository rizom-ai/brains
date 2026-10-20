#!/usr/bin/env bun
import {
  assertCoordinatedStableReleasePlan,
  assertReleaseConfigReferencesWorkspacePackages,
  assertReleasePlanMatchesLane,
  inferReleaseLane,
  migratePrereleaseHistory,
  parsePrereleaseState,
  readPrereleaseHistory,
  packageMatchesReleaseLane,
  resolveReleaseVersionStrategy,
  resolveReleaseWorkflowMode,
  type ReleaseLane,
} from "@brains/build-tools";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import { readConfig } from "@changesets/config";
import parseChangesetFile from "@changesets/parse";
import { getPackages } from "@manypkg/get-packages";
import { z } from "@brains/utils/zod";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const changesetDir = join(repositoryRoot, ".changeset");

const changesetConfigSchema = z.looseObject({
  fixed: z.array(z.array(z.string())).default([]),
  linked: z.array(z.array(z.string())).default([]),
  ignore: z.array(z.string()).default([]),
});

// Only `packages` selects workspace members; a group's `dependencies` may name
// external packages that are correctly absent from the workspace.
const syncpackGroupSchema = z.looseObject({
  packages: z.array(z.string()).default([]),
});
const syncpackConfigSchema = z.looseObject({
  versionGroups: z.array(syncpackGroupSchema).default([]),
  semverGroups: z.array(syncpackGroupSchema).default([]),
});

const command = process.argv[2];
const requestedLane = process.argv[3];

if (command === "add") {
  await addChangeset(
    requestedLane === undefined ? undefined : parseLane(requestedLane),
  );
} else if (command === "check") {
  if (requestedLane === undefined) {
    await validateRepository();
  } else {
    await validateLane(parseLane(requestedLane));
  }
} else if (command === "version") {
  await versionLane(parseLane(requestedLane));
} else if (command === "mode") {
  const currentPreState = await readPreState();
  const previousPreState = await readPreviousPreState();
  console.log(
    resolveReleaseWorkflowMode(currentPreState?.mode, previousPreState?.mode),
  );
} else {
  throw new Error(
    "Usage: bun scripts/release-lane.ts <add|check|version|mode> [core|site]",
  );
}

interface PendingChangeset {
  fileName: string;
  id: string;
  lane: ReleaseLane;
  summary: string;
  releases: ReturnType<typeof parseChangesetFile>["releases"];
}

async function addChangeset(
  explicitLane: ReleaseLane | undefined,
): Promise<void> {
  await assertNoUnscopedPendingChangesets();
  const before = new Set(await rootChangesetFiles());
  const exitCode = await run([process.execPath, "run", "changeset:raw"]);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  const created = (await rootChangesetFiles()).filter(
    (fileName) => !before.has(fileName),
  );
  if (created.length === 0) {
    console.log("No changeset created.");
    return;
  }
  if (created.length !== 1) {
    throw new Error(
      `Expected one changeset, but found ${created.length}: ${created.join(", ")}`,
    );
  }

  const sourceName = created[0];
  if (sourceName === undefined) {
    throw new Error("Expected a newly created changeset");
  }
  const parsed = parseChangesetFile(
    await readFile(join(changesetDir, sourceName), "utf8"),
  );
  const lane = explicitLane ?? inferReleaseLane(parsed.releases);
  const targetName = `${lane}--${sourceName}`;
  await rename(join(changesetDir, sourceName), join(changesetDir, targetName));
  await validateRepository();
  console.log(`Queued .changeset/${targetName} for the ${lane} release lane.`);
}

async function versionLane(lane: ReleaseLane): Promise<void> {
  const preState = await readPreState();
  const strategy = resolveReleaseVersionStrategy(lane, preState?.mode);
  const pending = await validateRepository();

  if (strategy === "defer") {
    console.log(
      "Stable prerelease exit is versioned once by the core release; site versioning is deferred.",
    );
    return;
  }
  if (strategy === "stable") {
    await migratePrereleaseHistory(repositoryRoot);
    const exitCode = await run([
      process.execPath,
      "run",
      "changeset:version:raw",
    ]);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
    // CLI 3 consumes the archive but leaves its empty directory behind. Never
    // discard remaining history: a nonempty archive must fail before publish.
    await rmdir(join(changesetDir, "pre")).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    });
    return;
  }

  const selected = pending.filter((changeset) => changeset.lane === lane);
  if (selected.length === 0) {
    console.log(`No pending ${lane} changesets.`);
    return;
  }

  await migratePrereleaseHistory(repositoryRoot);
  const opposite = pending.filter((changeset) => changeset.lane !== lane);
  const stashDir = await mkdtemp(join(repositoryRoot, ".release-lane-stash-"));
  let exitCode: number;
  const stashed: PendingChangeset[] = [];

  try {
    for (const changeset of opposite) {
      await rename(
        join(changesetDir, changeset.fileName),
        join(stashDir, changeset.fileName),
      );
      stashed.push(changeset);
    }
    exitCode = await run([process.execPath, "run", "changeset:version:raw"]);
  } finally {
    for (const changeset of stashed.reverse()) {
      await rename(
        join(stashDir, changeset.fileName),
        join(changesetDir, changeset.fileName),
      );
    }
    await rm(stashDir, { recursive: true, force: true });
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function validateRepository(): Promise<PendingChangeset[]> {
  await assertNoUnscopedPendingChangesets();
  await assertConsumedChangesetsReferenceWorkspacePackages();
  await assertReleaseConfigNamesLivePackages();
  const pending = await pendingChangesets();
  for (const lane of ["core", "site"] as const) {
    assertChangesetsMatchLane(lane, pending);
  }

  const preState = await readPreState();
  if (preState?.mode === "exit") {
    await validateStableReleasePlan(pending, preState);
  } else {
    for (const lane of ["core", "site"] as const) {
      await validateLanePlan(lane, pending, preState);
    }
  }

  console.log(
    `Validated ${pending.length} pending changeset${pending.length === 1 ? "" : "s"} across independent release lanes.`,
  );
  return pending;
}

async function validateLane(
  lane: ReleaseLane,
  knownPending?: readonly PendingChangeset[],
): Promise<void> {
  const pending = knownPending ?? (await pendingChangesets());
  assertChangesetsMatchLane(lane, pending);
  const preState = await readPreState();
  if (preState?.mode === "exit") {
    await validateStableReleasePlan(pending, preState);
    return;
  }
  await validateLanePlan(lane, pending, preState);
}

function assertChangesetsMatchLane(
  lane: ReleaseLane,
  pending: readonly PendingChangeset[],
): void {
  const wrongExplicitPackages = pending
    .filter((changeset) => changeset.lane === lane)
    .flatMap((changeset) =>
      changeset.releases
        .filter((release) => !packageMatchesReleaseLane(release.name, lane))
        .map((release) => `${changeset.fileName}: ${release.name}`),
    );
  if (wrongExplicitPackages.length > 0) {
    throw new Error(
      `${lane} changeset queue contains packages from the other lane:\n${wrongExplicitPackages.join("\n")}`,
    );
  }
}

async function validateLanePlan(
  lane: ReleaseLane,
  allPending: readonly PendingChangeset[],
  preState: Parameters<typeof assembleReleasePlan>[3],
): Promise<void> {
  const pending = allPending.filter((changeset) => changeset.lane === lane);
  if (pending.length === 0) {
    return;
  }

  const { packages, privatePackages, config } = await releasePlanContext();
  const plan = assembleReleasePlan(
    pending.map(changesetInput),
    packages,
    config,
    preState,
  );
  assertReleasePlanMatchesLane(
    lane,
    plan.releases.map((release) => ({
      name: release.name,
      type: release.type,
      private: privatePackages.has(release.name),
      ...(release.newVersion === undefined
        ? {}
        : { newVersion: release.newVersion }),
    })),
  );
}

async function validateStableReleasePlan(
  pending: readonly PendingChangeset[],
  preState: NonNullable<Parameters<typeof assembleReleasePlan>[3]>,
): Promise<void> {
  const { packages, privatePackages, config } = await releasePlanContext();
  const history = await readPrereleaseHistory(repositoryRoot);
  const consumed = await Promise.all(
    history.consumedFiles.map(async (fileName) => ({
      id: fileName.startsWith("pre/")
        ? fileName.slice(0, -3)
        : `pre/${fileName.slice(0, -3)}`,
      ...parseChangesetFile(
        await readFile(join(changesetDir, fileName), "utf8"),
      ),
    })),
  );
  const plan = assembleReleasePlan(
    [...pending.map(changesetInput), ...consumed],
    packages,
    config,
    preState,
  );
  assertCoordinatedStableReleasePlan(
    plan.releases.map((release) => ({
      name: release.name,
      type: release.type,
      private: privatePackages.has(release.name),
      ...(release.newVersion === undefined
        ? {}
        : { newVersion: release.newVersion }),
    })),
  );
}

async function releasePlanContext(): Promise<{
  packages: Awaited<ReturnType<typeof getPackages>>;
  privatePackages: Set<string>;
  config: NonNullable<Awaited<ReturnType<typeof readConfig>>["config"]>;
}> {
  const packages = await getPackages(repositoryRoot);
  const result = await readConfig(repositoryRoot, packages);
  if (result.config === undefined) {
    throw new Error(result.errors.join("\n"));
  }
  const config = result.config;
  const privatePackages = new Set(
    packages.packages
      .filter(({ packageJson }) => packageJson.private === true)
      .map(({ packageJson }) => packageJson.name),
  );
  return { packages, privatePackages, config };
}

function changesetInput({ id, summary, releases }: PendingChangeset): {
  id: string;
  summary: string;
  releases: PendingChangeset["releases"];
} {
  return { id, summary, releases };
}

async function pendingChangesets(): Promise<PendingChangeset[]> {
  const history = await readPrereleaseHistory(repositoryRoot);
  const pending: PendingChangeset[] = [];

  for (const fileName of history.pendingFiles) {
    const id = fileName.slice(0, -3);
    const lane = laneFromFileName(fileName);
    if (lane === undefined) {
      continue;
    }
    const parsed = parseChangesetFile(
      await readFile(join(changesetDir, fileName), "utf8"),
    );
    pending.push({ fileName, id, lane, ...parsed });
  }

  return pending.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

async function assertNoUnscopedPendingChangesets(): Promise<void> {
  const history = await readPrereleaseHistory(repositoryRoot);
  const unscoped = history.pendingFiles.filter(
    (fileName) => laneFromFileName(fileName) === undefined,
  );
  if (unscoped.length > 0) {
    throw new Error(
      `Pending changesets must use a core-- or site-- queue prefix. Recreate them with \`bun changeset\` (the lane is inferred from the packages): ${unscoped.join(", ")}`,
    );
  }
}

async function assertConsumedChangesetsReferenceWorkspacePackages(): Promise<void> {
  const history = await readPrereleaseHistory(repositoryRoot);
  if (history.consumedFiles.length === 0) {
    return;
  }

  const { packages } = await getPackages(repositoryRoot);
  const workspacePackages = new Set(
    packages.map(({ packageJson }) => packageJson.name),
  );
  const missing: string[] = [];

  for (const fileName of history.consumedFiles) {
    const parsed = parseChangesetFile(
      await readFile(join(changesetDir, fileName), "utf8"),
    );
    for (const release of parsed.releases) {
      if (!workspacePackages.has(release.name)) {
        missing.push(`${fileName}: ${release.name}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Consumed prerelease changesets reference packages that are no longer in the workspace:\n${missing.join("\n")}`,
    );
  }
}

/**
 * Package deletions leave inert entries behind in release and dependency
 * config. Hold both files to the live workspace so the next retirement fails
 * here instead of during a release.
 */
async function assertReleaseConfigNamesLivePackages(): Promise<void> {
  const { packages } = await getPackages(repositoryRoot);
  const changesetConfig = changesetConfigSchema.parse(
    JSON.parse(await readFile(join(changesetDir, "config.json"), "utf8")),
  );
  const syncpackConfig = syncpackConfigSchema.parse(
    JSON.parse(
      await readFile(join(repositoryRoot, ".syncpackrc.json"), "utf8"),
    ),
  );
  const syncpackPackages = [
    ...syncpackConfig.versionGroups,
    ...syncpackConfig.semverGroups,
  ].flatMap((group) => group.packages);

  assertReleaseConfigReferencesWorkspacePackages(
    packages.map(({ packageJson }) => packageJson.name),
    [
      {
        source: ".changeset/config.json",
        names: [
          ...changesetConfig.fixed.flat(),
          ...changesetConfig.linked.flat(),
          ...changesetConfig.ignore,
        ],
      },
      {
        source: ".syncpackrc.json",
        names: syncpackPackages,
      },
    ],
  );
}

async function rootChangesetFiles(): Promise<string[]> {
  return (await readdir(changesetDir))
    .filter((fileName) => fileName.endsWith(".md") && fileName !== "README.md")
    .sort();
}

async function readPreState(): Promise<
  Parameters<typeof assembleReleasePlan>[3]
> {
  return (await readPrereleaseHistory(repositoryRoot)).state;
}

async function readPreviousPreState(): Promise<
  Parameters<typeof assembleReleasePlan>[3]
> {
  const child = Bun.spawn(["git", "show", "HEAD^:.changeset/pre.json"], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "ignore",
  });
  const [exitCode, text] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  return exitCode === 0 ? parsePrereleaseState(text) : undefined;
}

function laneFromFileName(fileName: string): ReleaseLane | undefined {
  if (fileName.startsWith("core--")) {
    return "core";
  }
  if (fileName.startsWith("site--")) {
    return "site";
  }
  return undefined;
}

function parseLane(value: string | undefined): ReleaseLane {
  if (value === "core" || value === "site") {
    return value;
  }
  throw new Error("Release lane must be either core or site");
}

async function run(argv: string[]): Promise<number> {
  const child = Bun.spawn(argv, {
    cwd: repositoryRoot,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return child.exited;
}
