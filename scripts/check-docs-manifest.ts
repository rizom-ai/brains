#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { type DocsManifestEntry, parseDocsManifest } from "./docs-manifest";

const root = process.cwd();
const manifestPath = path.join(root, "docs", "docs-manifest.yaml");

function validateEntries(entries: DocsManifestEntry[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const sources = new Set<string>();

  if (entries.length === 0) {
    issues.push("manifest has no docs entries");
  }

  for (const entry of entries) {
    const label = `doc '${entry.id}'`;

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
      issues.push(`${label}: id must be kebab-case`);
    }
    if (ids.has(entry.id)) {
      issues.push(`${label}: duplicate id`);
    }
    ids.add(entry.id);

    if (path.isAbsolute(entry.source) || entry.source.includes("..")) {
      issues.push(`${label}: source must be a repo-relative path`);
    }
    if (!entry.source.endsWith(".md")) {
      issues.push(`${label}: source must be a markdown file`);
    }
    if (sources.has(entry.source)) {
      issues.push(`${label}: duplicate source ${entry.source}`);
    }
    sources.add(entry.source);

    const resolved = path.join(root, entry.source);
    if (!existsSync(resolved)) {
      issues.push(`${label}: source not found: ${entry.source}`);
    }
  }

  return issues;
}

if (!existsSync(manifestPath)) {
  console.error("Missing docs/docs-manifest.yaml");
  process.exit(1);
}

const entries = parseDocsManifest(readFileSync(manifestPath, "utf8"));
const issues = validateEntries(entries);

if (issues.length === 0) {
  console.log(`Docs manifest OK (${entries.length} docs checked)`);
  process.exit(0);
}

console.error("Docs manifest issues found:\n");
for (const issue of issues) {
  console.error(`- ${issue}`);
}
process.exit(1);
