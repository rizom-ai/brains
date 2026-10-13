#!/usr/bin/env bun
/**
 * Keeps the deploy scripts copied into generated-project templates identical
 * to their canonical source in `shared/deploy-support/src/deploy-scripts`.
 *
 * A generated repo cannot import from this monorepo, so these scripts are
 * copied into the templates rather than shared. That copy is deliberate; what
 * is not deliberate is the copies drifting, which nothing detected until now.
 * `--check` reports drift (used by pre-commit); without it, each stale copy is
 * rewritten from the canonical file.
 *
 * This is the same shape as `sync-env-templates.ts`, for the same reason.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CANONICAL_DIR = "shared/deploy-support/src/deploy-scripts";

export const DEPLOY_SCRIPT_TEMPLATES = [
  "packages/brain-cli/templates/deploy/scripts",
  "packages/brains-ops/templates/rover-pilot/deploy/scripts",
];

/**
 * Scripts a template owns outright, even where a file of the same name exists
 * canonically.
 *
 * `helpers.ts` is each template's binding to the package that ships these
 * scripts — `@brains/deploy-support` here, `@rizom/ops/deploy` in a pilot repo
 * — so it is expected to differ, and forcing it equal would break the
 * generated project's imports.
 */
export const TEMPLATE_OWNED = ["helpers.ts"];

export interface DeployScriptSource {
  readCanonical: (name: string) => string | undefined;
  listCanonical: () => string[];
  readTemplate: (dir: string, name: string) => string | undefined;
  listTemplate: (dir: string) => string[];
}

export interface StaleDeployScript {
  template: string;
  name: string;
  /** What the copy should contain. */
  content: string;
}

export interface DeployScriptComparison {
  stale: StaleDeployScript[];
  /** How many copies were actually compared, so a silent zero is visible. */
  compared: number;
}

const fileSystemSource: DeployScriptSource = {
  readCanonical: (name) => {
    const path = join(CANONICAL_DIR, name);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  },
  listCanonical: () => readdirSync(CANONICAL_DIR),
  readTemplate: (dir, name) => {
    const path = join(dir, name);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  },
  listTemplate: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
};

/**
 * Compare every canonical script against the templates that ship a copy of it.
 *
 * A template that does not ship a given script is not stale — not every
 * template deploys every capability, and absence is a choice. Only a copy that
 * exists and differs is drift.
 */
export function compareDeployScripts(
  source: DeployScriptSource | undefined,
  templates: string[],
): DeployScriptComparison {
  const reader = source ?? fileSystemSource;
  const stale: StaleDeployScript[] = [];
  let compared = 0;

  for (const name of reader.listCanonical()) {
    if (TEMPLATE_OWNED.includes(name)) continue;
    const canonical = reader.readCanonical(name);
    if (canonical === undefined) continue;
    for (const template of templates) {
      const copy = reader.readTemplate(template, name);
      if (copy === undefined) continue;
      compared += 1;
      if (copy !== canonical)
        stale.push({ template, name, content: canonical });
    }
  }

  return { stale, compared };
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const { stale, compared } = compareDeployScripts(
    undefined,
    DEPLOY_SCRIPT_TEMPLATES,
  );

  if (stale.length === 0) {
    console.log(`✓ ${compared} copied deploy scripts are in sync`);
  } else if (check) {
    for (const entry of stale)
      console.error(
        `✗ ${join(entry.template, entry.name)} has drifted from ${CANONICAL_DIR}`,
      );
    console.error("Run: bun run deploy-scripts:sync");
    process.exit(1);
  } else {
    for (const entry of stale) {
      writeFileSync(join(entry.template, entry.name), entry.content);
      console.log(`✓ wrote ${join(entry.template, entry.name)}`);
    }
  }
}
