import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

import { reconcileAll } from "./reconcile-all";

export interface ReconcileDryRunResult {
  firstPassChangedFiles: string[];
  secondPassChangedFiles: string[];
}

const excludedDirectoryNames = new Set([
  ".git",
  ".operator",
  ".brains-ops",
  ".turbo",
  "dist",
  "node_modules",
]);

/**
 * Reconcile an isolated copy twice with external content-repo access disabled.
 * The source repository is never written.
 */
export async function dryRunReconcileAll(
  rootDir: string,
): Promise<ReconcileDryRunResult> {
  const sourceRoot = resolve(rootDir);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "brains-ops-reconcile-"));
  const copyRoot = join(temporaryRoot, "repo");

  try {
    await cp(sourceRoot, copyRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (path) => shouldCopyForDryRun(sourceRoot, path),
    });

    const before = await hashTree(copyRoot);
    await reconcileWithoutExternalAccess(copyRoot);
    const afterFirstPass = await hashTree(copyRoot);
    await reconcileWithoutExternalAccess(copyRoot);
    const afterSecondPass = await hashTree(copyRoot);

    return {
      firstPassChangedFiles: changedPaths(before, afterFirstPass),
      secondPassChangedFiles: changedPaths(afterFirstPass, afterSecondPass),
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function shouldCopyForDryRun(sourceRoot: string, path: string): boolean {
  const relativePath = relative(sourceRoot, path);
  if (relativePath.length === 0) return true;
  const segments = relativePath.split(sep);
  if (segments.some((segment) => excludedDirectoryNames.has(segment))) {
    return false;
  }
  if (relativePath === ".env" || relativePath === ".env.local") {
    return false;
  }
  return !basename(relativePath).endsWith(".secrets.yaml");
}

async function reconcileWithoutExternalAccess(rootDir: string): Promise<void> {
  await reconcileAll(rootDir, undefined, {
    env: {},
    contentRepoRemoteResolver: () => undefined,
    fetchImpl: async () => {
      throw new Error("Dry-run reconcile attempted external HTTP access");
    },
    runCommand: async () => {
      throw new Error("Dry-run reconcile attempted a subprocess");
    },
  });
}

async function hashTree(rootDir: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  await hashDirectory(rootDir, "", hashes);
  return hashes;
}

async function hashDirectory(
  rootDir: string,
  relativeDirectory: string,
  hashes: Map<string, string>,
): Promise<void> {
  const directory = join(rootDir, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = join(relativeDirectory, entry.name);
    const absolutePath = join(rootDir, relativePath);
    if (entry.isDirectory()) {
      await hashDirectory(rootDir, relativePath, hashes);
      continue;
    }

    const stats = await lstat(absolutePath);
    const content = stats.isSymbolicLink()
      ? `symlink:${await readlink(absolutePath)}`
      : await readFile(absolutePath);
    hashes.set(
      relativePath,
      createHash("sha256").update(content).digest("hex"),
    );
  }
}

function changedPaths(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
}
