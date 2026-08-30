#!/usr/bin/env bun

/**
 * Boundary casts outside `shell/`.
 *
 * A package that reaches past its granted context for a wider shell service
 * writes `context.entityService as IEntityService`. That compiles, so no gate
 * reports it: the import list stays clean, the types check, and the boundary
 * is gone anyway. `plugins/directory-sync` carried five of them until the
 * coordination capability replaced them, and nothing would have told us.
 *
 * Inside `shell/` the wider interfaces are the local vocabulary, so the ban
 * is scoped to everything else.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CAST = /\bas\s+I[A-Z][A-Za-z]*(?:Service|Bus)\b/;

/** Blank out a span, keeping newlines so line numbers stay true. */
const blank = (match: string): string => match.replace(/\S/g, " ");

/**
 * An import alias (`import { EntityService as IEntityService }`) is not a
 * cast, and neither is prose describing one — this file's own comments would
 * otherwise fail it. Blank both out before matching.
 */
function scannable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];/gm, blank);
}

const files = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
  encoding: "utf-8",
})
  .split("\n")
  .filter(Boolean)
  .filter((path) => !path.startsWith("shell/"));

const violations: string[] = [];

for (const path of files) {
  const lines = scannable(readFileSync(path, "utf-8")).split("\n");
  lines.forEach((line, index) => {
    if (CAST.test(line)) {
      violations.push(`${path}:${index + 1}  ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error(
    `Boundary casts outside shell/ (${violations.length}):\n` +
      violations.map((entry) => `  ${entry}`).join("\n") +
      "\n\nA package gets what its context grants. If the granted surface is " +
      "too narrow, widen it as a typed capability with a named consumer " +
      "rather than casting past it. In a test, take a @brains/test-utils " +
      "factory or narrow the parameter of the code under test.",
  );
  process.exit(1);
}

console.log(`Boundary casts OK (${files.length} files outside shell/)`);
