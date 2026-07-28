#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, normalize, relative, sep } from "node:path";
import { z } from "@brains/utils/zod";

const repositoryRoot = process.cwd();
const inventoryPath = join(
  repositoryRoot,
  "docs",
  "legacy-code-inventory.json",
);
const checkerPath = "scripts/check-legacy-code.ts";
const codeExtensionPattern = /\.(?:[cm]?[jt]sx?)$/;
const legacyPattern = /\blegacy\b/i;

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
  class: z.enum(["historical-terminology", "third-party-naming"]),
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

function readInventory(): Inventory {
  if (!existsSync(inventoryPath)) {
    throw new Error("Missing docs/legacy-code-inventory.json");
  }

  return inventorySchema.parse(JSON.parse(readFileSync(inventoryPath, "utf8")));
}

function validateInventory(inventory: Inventory): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const coveredPaths = new Map<string, string>();

  for (const item of [...inventory.entries, ...inventory.exemptions]) {
    if (ids.has(item.id)) {
      issues.push(`duplicate inventory id: ${item.id}`);
    }
    ids.add(item.id);

    for (const rawPath of item.paths) {
      const path = toRepositoryPath(rawPath);
      const owner = coveredPaths.get(path);
      if (owner) {
        issues.push(`${path} is covered by both ${owner} and ${item.id}`);
        continue;
      }
      coveredPaths.set(path, item.id);

      const absolutePath = join(repositoryRoot, path);
      if (!existsSync(absolutePath)) {
        issues.push(`${item.id}: path does not exist: ${path}`);
        continue;
      }
      if (isTestPath(path)) {
        issues.push(
          `${item.id}: test paths are outside the active-source scan: ${path}`,
        );
        continue;
      }
      if (!legacyPattern.test(readFileSync(absolutePath, "utf8"))) {
        issues.push(`${item.id}: path has no legacy marker: ${path}`);
      }
    }
  }

  const legacyPaths = trackedCodePaths().filter((path) =>
    legacyPattern.test(readFileSync(join(repositoryRoot, path), "utf8")),
  );

  for (const path of legacyPaths) {
    if (!coveredPaths.has(path)) {
      const displayPath = relative(repositoryRoot, join(repositoryRoot, path));
      issues.push(`untracked legacy marker: ${displayPath}`);
    }
  }

  for (const [path, id] of coveredPaths) {
    if (!legacyPaths.includes(path)) {
      issues.push(
        `${id}: inventory path is not in the active legacy scan: ${path}`,
      );
    }
  }

  return issues;
}

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
  console.error(
    error instanceof Error
      ? error.message
      : "Legacy code inventory check failed",
  );
  process.exit(1);
}
