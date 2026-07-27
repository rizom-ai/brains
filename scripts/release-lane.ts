#!/usr/bin/env bun
import {
  assertReleasePlanMatchesLane,
  inferReleaseLane,
  packageMatchesReleaseLane,
  type ReleaseLane,
} from "@brains/build-tools";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import { read as readChangesetsConfig } from "@changesets/config";
import parseChangesetFile from "@changesets/parse";
import { getPackages } from "@manypkg/get-packages";
import { mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const changesetDir = join(repositoryRoot, ".changeset");
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
} else {
  throw new Error(
    "Usage: bun scripts/release-lane.ts <add|check|version> [core|site]",
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

  const sourceName = created[0]!;
  const parsed = parseChangesetFile(
    await readFile(join(changesetDir, sourceName), "utf8"),
  );
  const lane = explicitLane ?? inferReleaseLane(parsed.releases);
  const targetName = `${lane}--${sourceName}`;
  await rename(join(changesetDir, sourceName), join(changesetDir, targetName));
  await validateLane(lane);
  console.log(`Queued .changeset/${targetName} for the ${lane} release lane.`);
}

async function versionLane(lane: ReleaseLane): Promise<void> {
  const pending = await validateRepository();
  const selected = pending.filter((changeset) => changeset.lane === lane);
  if (selected.length === 0) {
    console.log(`No pending ${lane} changesets.`);
    return;
  }

  const opposite = pending.filter((changeset) => changeset.lane !== lane);
  const stashDir = await mkdtemp(join(repositoryRoot, ".release-lane-stash-"));
  let exitCode = 1;

  try {
    for (const changeset of opposite) {
      await rename(
        join(changesetDir, changeset.fileName),
        join(stashDir, changeset.fileName),
      );
    }
    exitCode = await run([process.execPath, "run", "changeset:version:raw"]);
  } finally {
    for (const changeset of opposite) {
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
  const pending = await pendingChangesets();
  for (const lane of ["core", "site"] as const) {
    await validateLane(lane, pending);
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
  const pending = (knownPending ?? (await pendingChangesets())).filter(
    (changeset) => changeset.lane === lane,
  );

  const wrongExplicitPackages = pending.flatMap((changeset) =>
    changeset.releases
      .filter((release) => !packageMatchesReleaseLane(release.name, lane))
      .map((release) => `${changeset.fileName}: ${release.name}`),
  );
  if (wrongExplicitPackages.length > 0) {
    throw new Error(
      `${lane} changeset queue contains packages from the other lane:\n${wrongExplicitPackages.join("\n")}`,
    );
  }
  if (pending.length === 0) {
    return;
  }

  const packages = await getPackages(repositoryRoot);
  const config = await readChangesetsConfig(repositoryRoot, packages);
  const privatePackages = new Set(
    packages.packages
      .filter(({ packageJson }) => packageJson.private === true)
      .map(({ packageJson }) => packageJson.name),
  );
  const preState = await readPreState();
  const plan = assembleReleasePlan(
    pending.map(({ id, summary, releases }) => ({ id, summary, releases })),
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
    })),
  );
}

async function pendingChangesets(): Promise<PendingChangeset[]> {
  const consumed = new Set((await readPreState())?.changesets ?? []);
  const pending: PendingChangeset[] = [];

  for (const fileName of await rootChangesetFiles()) {
    const id = fileName.slice(0, -3);
    if (consumed.has(id)) {
      continue;
    }
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
  const consumed = new Set((await readPreState())?.changesets ?? []);
  const unscoped = (await rootChangesetFiles()).filter((fileName) => {
    const id = fileName.slice(0, -3);
    return !consumed.has(id) && laneFromFileName(fileName) === undefined;
  });
  if (unscoped.length > 0) {
    throw new Error(
      `Pending changesets must use a core-- or site-- queue prefix. Recreate them with \`bun changeset\` (the lane is inferred from the packages): ${unscoped.join(", ")}`,
    );
  }
}

async function rootChangesetFiles(): Promise<string[]> {
  return (await readdir(changesetDir))
    .filter((fileName) => fileName.endsWith(".md") && fileName !== "README.md")
    .sort();
}

async function readPreState(): Promise<
  Parameters<typeof assembleReleasePlan>[3]
> {
  const text = await readFile(join(changesetDir, "pre.json"), "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    },
  );
  return text === undefined
    ? undefined
    : (JSON.parse(text) as Parameters<typeof assembleReleasePlan>[3]);
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
