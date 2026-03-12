#!/usr/bin/env bun
import { existsSync } from "fs";
import { join, dirname } from "path";

const cwd = process.cwd();

// Find monorepo root (directory containing bun.lock)
let monorepoRoot = cwd;
while (!existsSync(join(monorepoRoot, "bun.lock"))) {
  const parent = dirname(monorepoRoot);
  if (parent === monorepoRoot) {
    console.error("Could not find monorepo root");
    process.exit(1);
  }
  monorepoRoot = parent;
}

const compileScript = join(monorepoRoot, "scripts", "compile-hydration.ts");
if (!existsSync(compileScript)) {
  console.error(`Compile script not found: ${compileScript}`);
  process.exit(1);
}

const proc = Bun.spawnSync(["bun", compileScript], {
  cwd: monorepoRoot,
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(proc.exitCode);
