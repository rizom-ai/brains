#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { handleCLI } from "./cli";
import { resolve } from "./brain-resolver";
import { parseInstanceOverrides } from "./instance-overrides";
import type { InstanceOverrides } from "./instance-overrides";
import type { BrainDefinition } from "./brain-definition";

/**
 * Load and parse brain.yaml from the current working directory.
 */
function loadBrainYaml(): InstanceOverrides {
  const yamlPath = join(process.cwd(), "brain.yaml");

  if (!existsSync(yamlPath)) {
    console.error("❌ No brain.yaml found in current directory");
    process.exit(1);
  }

  const content = readFileSync(yamlPath, "utf-8");
  const overrides = parseInstanceOverrides(content);

  if (!overrides.brain) {
    console.error(
      '❌ brain.yaml must contain a "brain" field, e.g.:\n  brain: "@brains/relay"',
    );
    process.exit(1);
  }

  return overrides;
}

/**
 * Dynamically import the brain package and return its default export
 * (a BrainDefinition).
 */
async function loadBrainDefinition(
  packageName: string,
): Promise<BrainDefinition> {
  try {
    const mod = await import(packageName);
    if (!mod.default) {
      console.error(`❌ ${packageName} does not have a default export`);
      process.exit(1);
    }
    return mod.default;
  } catch (error) {
    console.error(`❌ Failed to import brain package "${packageName}":`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Main entry point for the `brains` CLI.
 *
 * Reads brain.yaml → imports brain definition → resolves with overrides → runs.
 */
async function main(): Promise<void> {
  const overrides = loadBrainYaml();
  // brain is guaranteed to exist by loadBrainYaml validation above
  const brainPackage = overrides.brain ?? "";
  const definition = await loadBrainDefinition(brainPackage);
  const config = resolve(definition, process.env, overrides);
  await handleCLI(config);
}

await main();
