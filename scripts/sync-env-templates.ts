#!/usr/bin/env bun
/**
 * Renders the shell-owned env section (from `shellEnvVars` in
 * `@brains/core`) into each brain's `env.schema.template`, between the
 * SHELL_ENV_SECTION markers. Run after changing any service's
 * env-schema.ts; `--check` verifies the templates are in sync (used by
 * pre-commit and tests).
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { shellEnvVars } from "@brains/core";
import {
  renderEnvSchemaSection,
  replaceShellEnvSection,
} from "@brains/utils/env-schema";

const MODELS = ["rover", "ranger", "relay"];
const check = process.argv.includes("--check");
let stale = false;

for (const model of MODELS) {
  const templatePath = join("brains", model, "env.schema.template");
  const current = readFileSync(templatePath, "utf8");
  const synced = replaceShellEnvSection(
    current,
    renderEnvSchemaSection(shellEnvVars(model)),
  );
  if (current === synced) continue;
  if (check) {
    console.error(`✗ ${templatePath} is out of sync with shellEnvVars()`);
    stale = true;
  } else {
    writeFileSync(templatePath, synced);
    console.log(`✓ wrote ${templatePath}`);
  }
}

if (check) {
  if (stale) {
    console.error("Run: bun scripts/sync-env-templates.ts");
    process.exit(1);
  }
  console.log("✓ env.schema.template files are in sync with shellEnvVars()");
}
