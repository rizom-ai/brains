#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type ManifestEntry = {
  id?: string;
  title?: string;
  section?: string;
  order?: number;
  source?: string;
};

const root = process.cwd();
const manifestPath = path.join(root, "docs", "docs-manifest.yaml");

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseManifest(content: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  let current: ManifestEntry | undefined;

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    if (line.trim() === "docs:") continue;

    const itemMatch = line.match(/^\s*-\s+([a-zA-Z]+):\s*(.+)$/);
    if (itemMatch) {
      current = {};
      entries.push(current);
      assignField(current, itemMatch[1] ?? "", itemMatch[2] ?? "", index + 1);
      continue;
    }

    const fieldMatch = line.match(/^\s{4}([a-zA-Z]+):\s*(.+)$/);
    if (fieldMatch && current) {
      assignField(current, fieldMatch[1] ?? "", fieldMatch[2] ?? "", index + 1);
      continue;
    }

    throw new Error(
      `Unsupported manifest syntax at line ${index + 1}: ${rawLine}`,
    );
  }

  return entries;
}

function assignField(
  entry: ManifestEntry,
  key: string,
  rawValue: string,
  lineNumber: number,
): void {
  const value = unquote(rawValue);
  switch (key) {
    case "id":
    case "title":
    case "section":
    case "source":
      entry[key] = value;
      return;
    case "order": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error(`Invalid order at line ${lineNumber}: ${rawValue}`);
      }
      entry.order = parsed;
      return;
    }
    default:
      throw new Error(`Unknown manifest field at line ${lineNumber}: ${key}`);
  }
}

function validateEntries(entries: ManifestEntry[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const sources = new Set<string>();

  if (entries.length === 0) {
    issues.push("manifest has no docs entries");
  }

  for (const [index, entry] of entries.entries()) {
    const label = entry.id ? `doc '${entry.id}'` : `entry ${index + 1}`;

    for (const field of [
      "id",
      "title",
      "section",
      "order",
      "source",
    ] as const) {
      if (entry[field] === undefined || entry[field] === "") {
        issues.push(`${label}: missing ${field}`);
      }
    }

    if (entry.id) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
        issues.push(`${label}: id must be kebab-case`);
      }
      if (ids.has(entry.id)) {
        issues.push(`${label}: duplicate id`);
      }
      ids.add(entry.id);
    }

    if (entry.source) {
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
  }

  return issues;
}

if (!existsSync(manifestPath)) {
  console.error("Missing docs/docs-manifest.yaml");
  process.exit(1);
}

const entries = parseManifest(readFileSync(manifestPath, "utf8"));
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
