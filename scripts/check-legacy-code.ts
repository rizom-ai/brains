#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, normalize, sep } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";

const repositoryRoot = join(import.meta.dir, "..");
const inventoryPath = join(
  repositoryRoot,
  "docs",
  "legacy-code-inventory.json",
);
const checkerPath = "scripts/check-legacy-code.ts";
const codeExtensionPattern = /\.(?:[cm]?[jt]sx?)$/;

/**
 * What marks source as compatibility code: the word "legacy", the word
 * "deprecated" (the JSDoc `@deprecated` included), and an identifier that
 * carries Legacy in any case style (`legacyFoo`, `isLegacyBar`, `LEGACY_BAZ`).
 */
const legacyMarkerPatterns: readonly RegExp[] = [
  /\blegacy\b/i,
  /deprecated/i,
  /[A-Za-z0-9_$](?:legacy|Legacy|LEGACY)|(?:legacy|Legacy|LEGACY)[A-Za-z0-9_$]/,
];

export function hasLegacyMarker(source: string): boolean {
  return legacyMarkerPatterns.some((pattern) => pattern.test(source));
}

const inventoryItemBaseSchema = {
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  paths: z.array(z.string().min(1)).min(1),
};

const inventoryEntrySchema = z.strictObject({
  ...inventoryItemBaseSchema,
  symbol: z.string().min(1),
  owner: z.string().min(1),
  class: z.enum([
    "offline-migration",
    "rejection-only-compatibility",
    "runtime-compatibility",
    "durable-data-compatibility",
  ]),
  behavior: z.string().min(1),
  currentConsumers: z.string().min(1),
  removalPrerequisite: z.string().min(1),
  rollbackDependency: z.string().min(1),
  targetRelease: z.string().min(1),
});

const inventoryExemptionSchema = z.strictObject({
  ...inventoryItemBaseSchema,
  class: z.enum([
    "historical-terminology",
    "third-party-naming",
    "domain-vocabulary",
  ]),
  reason: z.string().min(1),
});

const inventorySchema = z.strictObject({
  version: z.literal(1),
  entries: z.array(inventoryEntrySchema),
  exemptions: z.array(inventoryExemptionSchema),
});

type Inventory = z.infer<typeof inventorySchema>;

function toRepositoryPath(path: string): string {
  return normalize(path).split(sep).join("/");
}

function isTestPath(path: string): boolean {
  const parts = path.split("/");
  return (
    parts.includes("test") ||
    parts.includes("tests") ||
    parts.includes("__tests__") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename(path))
  );
}

function trackedCodePaths(): string[] {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
      "*.mjs",
      "*.cjs",
    ],
    { cwd: repositoryRoot },
  ).toString("utf8");

  return output
    .split("\0")
    .filter(Boolean)
    .map(toRepositoryPath)
    .filter((path) => path !== checkerPath)
    .filter((path) => codeExtensionPattern.test(path))
    .filter((path) => !isTestPath(path))
    .filter((path) => existsSync(join(repositoryRoot, path)))
    .sort();
}

export function readInventory(): Inventory {
  if (!existsSync(inventoryPath)) {
    throw new Error("Missing docs/legacy-code-inventory.json");
  }

  return inventorySchema.parse(JSON.parse(readFileSync(inventoryPath, "utf8")));
}

function coveredPaths(inventory: Inventory): Set<string> {
  return new Set(
    [...inventory.entries, ...inventory.exemptions].flatMap((item) =>
      item.paths.map(toRepositoryPath),
    ),
  );
}

/** The given source paths that carry a legacy marker no inventory item covers. */
export function untrackedLegacyMarkers(
  inventory: Inventory,
  paths: readonly string[],
  readSource: (path: string) => string,
): string[] {
  const covered = coveredPaths(inventory);
  return paths.filter(
    (path) => !covered.has(path) && hasLegacyMarker(readSource(path)),
  );
}

function readRepositorySource(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function validateInventory(inventory: Inventory): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const owners = new Map<string, string>();

  for (const item of [...inventory.entries, ...inventory.exemptions]) {
    if (ids.has(item.id)) {
      issues.push(`duplicate inventory id: ${item.id}`);
    }
    ids.add(item.id);

    for (const rawPath of item.paths) {
      const path = toRepositoryPath(rawPath);
      const owner = owners.get(path);
      if (owner) {
        issues.push(`${path} is covered by both ${owner} and ${item.id}`);
        continue;
      }
      owners.set(path, item.id);

      if (!existsSync(join(repositoryRoot, path))) {
        issues.push(`${item.id}: path does not exist: ${path}`);
        continue;
      }
      if (isTestPath(path)) {
        issues.push(
          `${item.id}: test paths are outside the active-source scan: ${path}`,
        );
        continue;
      }
      if (!hasLegacyMarker(readRepositorySource(path))) {
        issues.push(`${item.id}: path has no legacy marker: ${path}`);
      }
    }
  }

  const codePaths = trackedCodePaths();
  for (const path of untrackedLegacyMarkers(
    inventory,
    codePaths,
    readRepositorySource,
  )) {
    issues.push(`untracked legacy marker: ${path}`);
  }

  for (const [path, id] of owners) {
    if (!codePaths.includes(path)) {
      issues.push(
        `${id}: inventory path is not in the active legacy scan: ${path}`,
      );
    }
  }

  return issues;
}

if (import.meta.main) {
  try {
    const inventory = readInventory();
    const issues = validateInventory(inventory);
    if (issues.length > 0) {
      console.error("Legacy code inventory issues found:\n");
      for (const issue of issues) console.error(`- ${issue}`);
      process.exit(1);
    }

    const coveredCount = inventory.entries.reduce(
      (count, entry) => count + entry.paths.length,
      0,
    );
    const exemptCount = inventory.exemptions.reduce(
      (count, exemption) => count + exemption.paths.length,
      0,
    );
    console.log(
      `Legacy code inventory OK (${coveredCount} owned paths, ${exemptCount} exemptions)`,
    );
  } catch (error) {
    console.error(getErrorMessage(error, "Legacy code inventory check failed"));
    process.exit(1);
  }
}
