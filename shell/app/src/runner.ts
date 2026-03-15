#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { handleCLI } from "./cli";
import { resolve, isScopedPackageRef } from "./brain-resolver";
import { parseInstanceOverrides } from "./instance-overrides";
import type { InstanceOverrides } from "./instance-overrides";
import type { BrainDefinition } from "./brain-definition";
import { registerPackage } from "./package-registry";
import { internal } from "varlock";

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
 * Scan plugin overrides for @-prefixed package references,
 * dynamically import each one, and register in the package registry.
 */
async function registerPackageRefs(
  overrides: InstanceOverrides,
): Promise<void> {
  const plugins = overrides.plugins;
  if (!plugins) return;

  for (const config of Object.values(plugins)) {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === "string" && isScopedPackageRef(value)) {
        try {
          const mod = await import(value);
          registerPackage(value, mod.default);
        } catch {
          console.warn(
            `brain.yaml: failed to import package "${value}" for key "${key}"`,
          );
        }
      }
    }
  }
}

/**
 * Main entry point for the `brains` CLI.
 *
 * Reads brain.yaml → validates env → imports brain definition → resolves with overrides → runs.
 */
async function main(): Promise<void> {
  const overrides = loadBrainYaml();
  // brain is guaranteed to exist by loadBrainYaml validation above
  const brainPackage = overrides.brain ?? "";

  // Validate env against the brain's .env.schema.
  // Uses varlock's `internal` API — no public API supports custom schema paths yet.
  // TODO: Switch to public API when varlock adds path support (pin version until then).
  const brainPkgDir = dirname(
    new URL(import.meta.resolve(`${brainPackage}/package.json`)).pathname,
  );
  const schemaPath = join(brainPkgDir, ".env.schema");
  if (existsSync(schemaPath)) {
    const graph = await internal.loadVarlockEnvGraph({
      entryFilePath: schemaPath,
    });
    await graph.resolveEnvValues();
    try {
      // checkForConfigErrors logs details to stderr before throwing
      internal.checkForConfigErrors(graph);
    } catch {
      process.exit(1);
    }
  }

  const definition = await loadBrainDefinition(brainPackage);

  // Pre-register @-prefixed package references from plugin overrides
  await registerPackageRefs(overrides);

  const config = resolve(definition, process.env, overrides);
  await handleCLI(config);
}

await main();
