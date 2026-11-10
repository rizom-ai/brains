#!/usr/bin/env bun
import { runLanePublish, type ReleaseLane } from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";

const rootDir = process.cwd();
const lane = parseLane(process.argv[2]);
const packages = await getPackages(rootDir);

const exitCode = await runLanePublish(
  { repositoryRoot: rootDir, packages: packages.packages, lane },
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

function parseLane(value: string | undefined): ReleaseLane {
  if (value === "core" || value === "site") {
    return value;
  }
  throw new Error(
    "Publish lane must be either core or site; unscoped publishing is forbidden",
  );
}
