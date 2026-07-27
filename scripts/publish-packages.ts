#!/usr/bin/env bun
import { runWithPreparedPublishManifests } from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";

const rootDir = process.cwd();
const packages = await getPackages(rootDir);
const packageDirs = packages.packages
  .filter(({ packageJson }) => {
    const scripts = (packageJson as { scripts?: Record<string, string> })
      .scripts;
    return (
      packageJson.private !== true &&
      scripts?.["prepack"] === "publish-manifest prepare"
    );
  })
  .map(({ dir }) => dir);

const exitCode = await runWithPreparedPublishManifests(
  packageDirs,
  async () => {
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
  },
);

process.exit(exitCode);
