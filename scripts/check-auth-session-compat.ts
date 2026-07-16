#!/usr/bin/env bun

import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface AuthSessionCompatibilityMetadata {
  newCookieIntroducedIn: string;
  drizzleMigrationsIntroducedIn: string;
  minimumSupportedUpgradeVersion: string | null;
}

const COMPATIBILITY_DEFINITION_FILES = new Set([
  "scripts/check-auth-session-compat.ts",
  "shell/auth-service/src/auth-service.ts",
  "shell/auth-service/src/index.ts",
  "shell/auth-service/src/runtime-db.ts",
  "shell/auth-service/src/runtime-schema.ts",
  "shell/auth-service/src/session-store.ts",
]);

const DEPRECATED_PATTERNS: Array<[label: string, pattern: RegExp]> = [
  ["createOperatorSession", /\bcreateOperatorSession\b/],
  ["getOperatorSession", /\bgetOperatorSession\b/],
  ["resolveOperatorSession", /\bresolveOperatorSession\b/],
  [
    "OperatorSession API",
    /\b(?:Runtime)?OperatorSession(?:Persistence|Record|Store|StoreOptions)?\b/,
  ],
  ["CreateOperatorSessionResult", /\bCreateOperatorSessionResult\b/],
  ["brains_operator_session", /brains_operator_session/],
];

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".turbo",
  "dist",
  "node_modules",
  "coverage",
]);

export async function findDeprecatedAuthSessionConsumers(
  root: string,
): Promise<string[]> {
  const files = await sourceFiles(root);
  const violations: string[] = [];

  for (const file of files) {
    const repositoryPath = relative(root, file).replaceAll("\\", "/");
    if (COMPATIBILITY_DEFINITION_FILES.has(repositoryPath)) continue;

    const lines = (await readFile(file, "utf8")).split("\n");
    for (const [index, line] of lines.entries()) {
      for (const [label, pattern] of DEPRECATED_PATTERNS) {
        if (pattern.test(line)) {
          violations.push(`${repositoryPath}:${index + 1}:${label}`);
        }
      }
    }
  }

  return violations.sort();
}

export async function stampCompatibilityRelease(
  metadataPath: string,
  packagePath: string,
): Promise<boolean> {
  const metadata = JSON.parse(
    await readFile(metadataPath, "utf8"),
  ) as AuthSessionCompatibilityMetadata;
  if (
    metadata.newCookieIntroducedIn !== "unreleased" &&
    metadata.drizzleMigrationsIntroducedIn !== "unreleased"
  ) {
    return false;
  }

  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    version?: unknown;
  };
  if (typeof packageJson.version !== "string") {
    throw new Error("Auth-service package version is missing");
  }
  parseVersion(packageJson.version);
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        ...metadata,
        ...(metadata.newCookieIntroducedIn === "unreleased"
          ? { newCookieIntroducedIn: packageJson.version }
          : {}),
        ...(metadata.drizzleMigrationsIntroducedIn === "unreleased"
          ? { drizzleMigrationsIntroducedIn: packageJson.version }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
  return true;
}

export function isLegacyCookieRemovalEligible(
  metadata: AuthSessionCompatibilityMetadata,
): boolean {
  return isRemovalEligible(
    metadata.newCookieIntroducedIn,
    metadata.minimumSupportedUpgradeVersion,
  );
}

export function isLegacyDatabaseBridgeRemovalEligible(
  metadata: AuthSessionCompatibilityMetadata,
): boolean {
  return isRemovalEligible(
    metadata.drizzleMigrationsIntroducedIn,
    metadata.minimumSupportedUpgradeVersion,
  );
}

function isRemovalEligible(
  introducedIn: string,
  minimumSupportedUpgradeVersion: string | null,
): boolean {
  if (
    introducedIn === "unreleased" ||
    minimumSupportedUpgradeVersion === null
  ) {
    return false;
  }
  return compareVersions(minimumSupportedUpgradeVersion, introducedIn) >= 0;
}

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await visit(resolve(directory, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
      if (/\.(?:test|spec)\.[^.]+$/.test(entry.name)) continue;
      files.push(resolve(directory, entry.name));
    }
  }

  await visit(root);
  return files;
}

function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index];
    if (difference !== 0) return difference;
  }
  if (leftVersion.prerelease === rightVersion.prerelease) return 0;
  if (leftVersion.prerelease === null) return 1;
  if (rightVersion.prerelease === null) return -1;
  return leftVersion.prerelease.localeCompare(rightVersion.prerelease, "en", {
    numeric: true,
  });
}

function parseVersion(value: string): {
  core: [number, number, number];
  prerelease: string | null;
} {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) throw new Error(`Invalid compatibility version: ${value}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, "..");
  const metadataPath = resolve(
    root,
    "shell/auth-service/auth-session-compat.json",
  );
  if (process.argv.includes("--stamp-release")) {
    const stamped = await stampCompatibilityRelease(
      metadataPath,
      resolve(root, "shell/auth-service/package.json"),
    );
    console.log(
      stamped
        ? "Stamped the auth-session cookie introduction release."
        : "Auth-session cookie introduction release was already stamped.",
    );
  }

  const metadata = JSON.parse(
    await readFile(metadataPath, "utf8"),
  ) as AuthSessionCompatibilityMetadata;
  const violations = await findDeprecatedAuthSessionConsumers(root);
  if (violations.length > 0) {
    console.error("Deprecated auth-session consumers remain:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }

  const sessionStore = await readFile(
    resolve(root, "shell/auth-service/src/session-store.ts"),
    "utf8",
  );
  const retainsLegacyReader = sessionStore.includes(
    "LEGACY_OPERATOR_SESSION_COOKIE",
  );
  const cookieRemovalEligible = isLegacyCookieRemovalEligible(metadata);
  if (!retainsLegacyReader && !cookieRemovalEligible) {
    console.error(
      "Legacy cookie support was removed before the release compatibility gate became eligible.",
    );
    process.exitCode = 1;
    return;
  }

  const runtimeDatabase = await readFile(
    resolve(root, "shell/auth-service/src/runtime-db.ts"),
    "utf8",
  );
  const retainsLegacyDatabaseBridge = runtimeDatabase.includes(
    "upgradeLegacyAuthDatabase",
  );
  const databaseBridgeRemovalEligible =
    isLegacyDatabaseBridgeRemovalEligible(metadata);
  if (!retainsLegacyDatabaseBridge && !databaseBridgeRemovalEligible) {
    console.error(
      "The pre-Drizzle database bridge was removed before the release compatibility gate became eligible.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    cookieRemovalEligible && databaseBridgeRemovalEligible
      ? "Auth compatibility consumers are migrated; legacy compatibility removal is release-eligible."
      : "Auth compatibility consumers are migrated; legacy compatibility remains required.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
