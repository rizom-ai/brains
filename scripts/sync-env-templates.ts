#!/usr/bin/env bun
/**
 * Generates the canonical brain's `env.schema.template` from its composed
 * environment declarations. Run after changing
 * any env-schema.ts; `--check` verifies the templates are in sync (used
 * by pre-commit). The templates are fully generated — never edit them
 * by hand.
 */
import { readFileSync, writeFileSync } from "fs";
import { canonicalEnvSchema } from "../packages/brain-cli/src/model/env-schema";
import {
  ENV_SCHEMA_HEADER,
  renderEnvSchemaSection,
  type EnvVarDecl,
} from "@brains/utils/env-schema";

const DEFINITIONS: Array<{
  definition: string;
  decls: EnvVarDecl[];
  templatePath: string;
}> = [
  {
    definition: "brain",
    decls: canonicalEnvSchema,
    templatePath: "packages/brain-cli/env.schema.template",
  },
];

const check = process.argv.includes("--check");
let stale = false;

for (const { definition, decls, templatePath } of DEFINITIONS) {
  const names = decls.map((decl) => decl.name);
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  if (duplicates.length > 0) {
    console.error(`✗ ${definition} declares duplicate env vars: ${duplicates}`);
    process.exit(1);
  }

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
