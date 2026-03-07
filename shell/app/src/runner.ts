#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { handleCLI } from "./cli";
import { resolve } from "./brain-resolver";
import type { BrainDefinition } from "./brain-definition";

/**
 * Load brain.yaml from the current working directory and return the
 * brain package name declared in it.
 */
function loadBrainYaml(): string {
  const yamlPath = join(process.cwd(), "brain.yaml");

  if (!existsSync(yamlPath)) {
    console.error("❌ No brain.yaml found in current directory");
    process.exit(1);
  }

  const content = readFileSync(yamlPath, "utf-8");

  // Minimal YAML parser — we only need `brain: <package-name>`
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;
    const match = trimmed.match(/^brain:\s*["']?([^"'\s#]+)["']?/);
    if (match?.[1]) return match[1];
  }

  console.error(
    '❌ brain.yaml must contain a "brain" field, e.g.:\n  brain: "@brains/team"',
  );
  process.exit(1);
}

/**
 * Dynamically import the brain package and return its default export
 * (a BrainDefinition).
 */
async function loadBrainDefinition(
  packageName: string,
): Promise<BrainDefinition> {
  try {
    const mod = (await import(packageName)) as { default: BrainDefinition };
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
 * Reads brain.yaml → imports brain definition → resolves config → runs.
 */
async function main(): Promise<void> {
  const packageName = loadBrainYaml();
  const definition = await loadBrainDefinition(packageName);
  const config = resolve(definition, process.env);
  await handleCLI(config);
}

await main();
