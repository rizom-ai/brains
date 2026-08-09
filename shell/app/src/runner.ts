#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { handleCLI } from "./cli";
import { resolve } from "./brain-resolver";
import { Logger } from "@brains/utils/logger";
import {
  parseInstanceOverrides,
  InstanceOverridesParseError,
} from "./instance-overrides";
import { registerConventionalSiteTheme } from "./register-conventional-site-theme";
import type { InstanceOverrides } from "./instance-overrides";
import type { BrainDefinition } from "./brain-definition";
import type { BrainDefinition as DeclarativeBrainDefinition } from "./contracts/brain-definition";
import { registerOverridePackages } from "./register-override-packages";
import { resolveBrainPackageName } from "./brain-package";
import { registerBrainDefinitionPackages } from "./register-brain-definition-packages";
import { resolveInstalledPackageManifest } from "./installed-package-metadata";
import { internal } from "varlock";
import { getErrorMessage } from "@brains/utils/error";

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
  let overrides: InstanceOverrides;
  try {
    overrides = parseInstanceOverrides(content);
  } catch (err) {
    if (err instanceof InstanceOverridesParseError) {
      console.error(`❌ ${err.message}`);
    } else {
      console.error(
        `❌ unexpected error parsing brain.yaml: ${getErrorMessage(err)}`,
      );
    }
    process.exit(1);
  }

  return overrides;
}

/**
 * Dynamically import the brain package and return its default export
 * (a BrainDefinition).
 */
type ResolvableBrainDefinition = BrainDefinition | DeclarativeBrainDefinition;

async function loadBrainDefinition(
  packageName: string,
): Promise<ResolvableBrainDefinition> {
  try {
    const mod = await import(packageName);
    if (!mod.default) {
      console.error(`❌ ${packageName} does not have a default export`);
      process.exit(1);
    }
    return mod.default;
  } catch (error) {
    console.error(`❌ Failed to import brain package "${packageName}":`);
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

/**
 * Main entry point for the `brains` CLI.
 *
 * Reads brain.yaml → validates env → imports brain definition → resolves with overrides → runs.
 */
async function main(): Promise<void> {
  const overrides = loadBrainYaml();
  let brainPackage: string;
  try {
    brainPackage = resolveBrainPackageName(overrides.brain);
  } catch (error) {
    console.error(`❌ ${getErrorMessage(error)}`);
    process.exit(1);
  }

  // Validate env against the brain's .env.schema.
  // Uses varlock's `internal` API — no public API supports custom schema paths yet.
  // TODO: Switch to public API when varlock adds path support (pin version until then).
  const brainPkgDir = resolveInstalledPackageManifest(
    brainPackage,
    process.cwd(),
  ).directory;
  const schemaPath = join(brainPkgDir, ".env.schema");
  if (existsSync(schemaPath)) {
    const graph = await internal.loadVarlockEnvGraph({
      entryFilePaths: [schemaPath],
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
  await registerBrainDefinitionPackages(
    brainPackage,
    definition,
    process.cwd(),
  );

  await registerOverridePackages(overrides);

  const effectiveOverrides = await registerConventionalSiteTheme(
    process.cwd(),
    overrides,
  );

  const logger = Logger.getInstance();
  const config = resolve(definition, process.env, effectiveOverrides, logger);
  await handleCLI(config);
}

await main();
