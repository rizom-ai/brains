#!/usr/bin/env bun
import {
  packageMatchesReleaseLane,
  runWithPreparedPublishManifests,
  runWithScopedReleasePackages,
  type ReleaseLane,
} from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";

const rootDir = process.cwd();
const lane = parseLane(process.argv[2]);
const packages = await getPackages(rootDir);
const packageDirs = packages.packages
  .filter(({ packageJson }) => {
    const scripts = (packageJson as { scripts?: Record<string, string> })
      .scripts;
    return (
      packageJson.private !== true &&
      packageMatchesReleaseLane(packageJson.name, lane) &&
      scripts?.["prepack"] === "publish-manifest prepare"
    );
  })
  .map(({ dir }) => dir);

const exitCode = await runWithScopedReleasePackages(
  packages.packages,
  lane,
  () =>
    runWithPreparedPublishManifests(packageDirs, async () => {
      const child = Bun.spawn(
        [process.execPath, "run", "changeset:publish:raw"],
        {
          cwd: rootDir,
          env: process.env,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        },
      );
      return child.exited;
    }),
);

process.exit(exitCode);

function parseLane(value: string | undefined): ReleaseLane {
  if (value === "core" || value === "site") {
    return value;
  }
  throw new Error(
    "Publish lane must be either core or site; unscoped publishing is forbidden",
  );
}
