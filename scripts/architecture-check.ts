#!/usr/bin/env bun

import { join } from "node:path";
import { runProcess } from "@brains/utils/run-process";
import { getErrorMessage } from "@brains/utils/error";
import {
  architectureStructuralEdges,
  parseArchitectureReporter,
  selectArchitectureSources,
} from "./architecture-source-inventory";

const repositoryRoot = join(import.meta.dir, "..");

async function trackedAndUnignoredPaths(): Promise<string[]> {
  const result = await runProcess(
    ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: repositoryRoot },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || "Could not read the git source inventory",
    );
  }
  return result.stdout.split("\0").filter(Boolean);
}

async function main(): Promise<number> {
  const reporter = parseArchitectureReporter(process.argv.slice(2));
  const inventory = selectArchitectureSources(
    repositoryRoot,
    await trackedAndUnignoredPaths(),
  );
  if (inventory.selected.length === 0) {
    throw new Error("Architecture source inventory is empty");
  }

  const worker = Bun.spawn(
    [
      "node",
      "--require",
      join(import.meta.dir, "dependency-cruiser-typescript-compat.cjs"),
      join(import.meta.dir, "architecture-cruise-worker.mjs"),
      "--reporter",
      reporter,
    ],
    {
      cwd: repositoryRoot,
      stdin: "pipe",
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  await worker.stdin.write(
    JSON.stringify({
      selected: inventory.selected,
      excluded: inventory.excluded,
      structuralEdges: architectureStructuralEdges,
    }),
  );
  await worker.stdin.end();
  return worker.exited;
}

if (import.meta.main) {
  try {
    process.exit(await main());
  } catch (error) {
    console.error(getErrorMessage(error, "Architecture check failed"));
    process.exit(1);
  }
}
