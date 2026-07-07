#!/usr/bin/env bun
/**
 * Generates each brain's `env.schema.template` from its composed env
 * declarations (`brains/<model>/src/env-schema.ts`). Run after changing
 * any env-schema.ts; `--check` verifies the templates are in sync (used
 * by pre-commit). The templates are fully generated — never edit them
 * by hand.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { roverEnvSchema } from "@brains/rover/src/env-schema";
import { rangerEnvSchema } from "@brains/ranger/src/env-schema";
import { relayEnvSchema } from "@brains/relay/env-schema";
import {
  ENV_SCHEMA_HEADER,
  renderEnvSchemaSection,
  type EnvVarDecl,
} from "@brains/utils/env-schema";

const MODELS: Array<{ model: string; decls: EnvVarDecl[] }> = [
  { model: "rover", decls: roverEnvSchema },
  { model: "ranger", decls: rangerEnvSchema },
  { model: "relay", decls: relayEnvSchema },
];

const check = process.argv.includes("--check");
let stale = false;

for (const { model, decls } of MODELS) {
  const names = decls.map((decl) => decl.name);
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  if (duplicates.length > 0) {
    console.error(`✗ ${model} declares duplicate env vars: ${duplicates}`);
    process.exit(1);
  }

  const templatePath = join("brains", model, "env.schema.template");
  const synced = `${ENV_SCHEMA_HEADER}\n\n${renderEnvSchemaSection(decls)}\n`;
  const current = readFileSync(templatePath, "utf8");
  if (current === synced) continue;
  if (check) {
    console.error(`✗ ${templatePath} is out of sync with its env schema`);
    stale = true;
  } else {
    writeFileSync(templatePath, synced);
    console.log(`✓ wrote ${templatePath}`);
  }
}

if (check) {
  if (stale) {
    console.error("Run: bun run env-schema:sync");
    process.exit(1);
  }
  console.log("✓ env.schema.template files are in sync");
}
