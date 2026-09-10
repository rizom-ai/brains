#!/usr/bin/env bun
import {
  packageMatchesReleaseLane,
  type ReleaseLane,
} from "@brains/build-tools";
import { runProcess } from "@brains/utils/run-process";
import { getPackages } from "@manypkg/get-packages";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const repositoryRoot = process.cwd();
const lane = parseLane(process.argv[2]);
const packages = await getPackages(repositoryRoot);
const siteDirectories = packages.packages
  .filter(({ packageJson }) =>
    packageMatchesReleaseLane(packageJson.name, "site"),
  )
  .map(({ dir }) => relative(repositoryRoot, dir).split(sep).join("/"));

const tracked = await runProcess(
  ["git", "ls-files", "-z", "--", "*.ts", "*.tsx", "*.md"],
  { cwd: repositoryRoot },
);
if (tracked.exitCode !== 0) {
  process.exit(tracked.exitCode);
}

const files = tracked.stdout
  .split("\0")
  .filter(Boolean)
  .filter((file) => existsSync(join(repositoryRoot, file)))
  .filter((file) => {
    const belongsToSitePackage = siteDirectories.some(
      (dir) => file === dir || file.startsWith(`${dir}/`),
    );
    return belongsToSitePackage === (lane === "site");
  });

for (let index = 0; index < files.length; index += 200) {
  const child = Bun.spawn(
    ["bunx", "prettier", "--check", ...files.slice(index, index + 200)],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function parseLane(value: string | undefined): ReleaseLane {
  if (value === "core" || value === "site") {
    return value;
  }
  throw new Error("Format lane must be either core or site");
}
