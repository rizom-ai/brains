import type {
  PreparedSiteBuild,
  SiteBuildArtifactManifest,
} from "@brains/site-engine";
import type { Logger } from "@brains/utils/logger";
import { promises as nodeFs } from "fs";
import { basename, dirname, join, relative, resolve } from "path";
import {
  createSiteBuildArtifactManifest,
  SITE_BUILD_MANIFEST_FILE,
} from "./site-build-artifact-manifest";

export interface SiteBuildOutputTarget {
  activeOutputDir: string;
  generationDir: string;
  workingDir: string;
  environmentDir: string;
  buildId: string;
}

export interface BeginSiteBuildOutputOptions {
  outputDir: string;
  environment: "preview" | "production";
  buildId: string;
  configuredWorkingDir?: string | undefined;
}

export interface CommitSiteBuildOutputOptions {
  target: SiteBuildOutputTarget;
  preparedBuild: PreparedSiteBuild;
  warnings: string[];
}

export interface SiteBuildOutputCommitResult {
  filesGenerated: number;
  manifestPath: string;
  manifest: SiteBuildArtifactManifest;
}

export interface SiteBuildOutputLifecycle {
  begin(options: BeginSiteBuildOutputOptions): Promise<SiteBuildOutputTarget>;
  commit(
    options: CommitSiteBuildOutputOptions,
  ): Promise<SiteBuildOutputCommitResult>;
  abort(target: SiteBuildOutputTarget): Promise<void>;
}

/** Directory entry shape used while scanning generation directories. */
export interface SiteBuildDirent {
  name: string;
  isDirectory(): boolean;
}

/** The single stat field the lifecycle depends on. */
export interface SiteBuildFileStat {
  mtimeMs: number;
}

/** The single lstat field the lifecycle depends on. */
export interface SiteBuildFileType {
  isSymbolicLink(): boolean;
}

/**
 * Narrow filesystem seam for the output lifecycle. The signatures are
 * deliberately non-overloaded (e.g. `stat` resolves to one plain shape) so
 * tests can supply a fake by spreading the default adapter and overriding a
 * single method without casts.
 */
export interface SiteBuildOutputFs {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  rm(
    path: string,
    options: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<SiteBuildDirent[]>;
  stat(path: string): Promise<SiteBuildFileStat>;
  access(path: string): Promise<void>;
  symlink(target: string, path: string, type: "dir"): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  readlink(path: string): Promise<string>;
  lstat(path: string): Promise<SiteBuildFileType>;
}

/** Default adapter delegating to `fs.promises`. */
export const nodeSiteBuildOutputFs: SiteBuildOutputFs = {
  mkdir: (path, options) => nodeFs.mkdir(path, options),
  rm: (path, options) => nodeFs.rm(path, options),
  readdir: (path, options) => nodeFs.readdir(path, options),
  stat: (path) => nodeFs.stat(path),
  access: (path) => nodeFs.access(path),
  symlink: (target, path, type) => nodeFs.symlink(target, path, type),
  rename: (oldPath, newPath) => nodeFs.rename(oldPath, newPath),
  readlink: (path) => nodeFs.readlink(path),
  lstat: (path) => nodeFs.lstat(path),
};

/** Filesystem-backed generation staging and active-output publication. */
export class TransactionalSiteBuildOutput implements SiteBuildOutputLifecycle {
  private readonly logger: Logger;
  private readonly retainedGenerations: number;
  private readonly staleGenerationAgeMs: number;
  private readonly fs: SiteBuildOutputFs;

  constructor(
    logger: Logger,
    retainedGenerations: number = 3,
    staleGenerationAgeMs: number = 24 * 60 * 60 * 1_000,
    fs: SiteBuildOutputFs = nodeSiteBuildOutputFs,
  ) {
    this.logger = logger.child("SiteBuildOutput");
    this.retainedGenerations = Math.max(1, retainedGenerations);
    this.staleGenerationAgeMs = Math.max(0, staleGenerationAgeMs);
    this.fs = fs;
  }

  async begin(
    options: BeginSiteBuildOutputOptions,
  ): Promise<SiteBuildOutputTarget> {
    assertSafeBuildId(options.buildId);
    const activeOutputDir = resolve(options.outputDir);
    const environmentDir = join(
      dirname(activeOutputDir),
      ".site-builds",
      options.environment,
    );
    const generationDir = join(environmentDir, options.buildId);
    const workingDir = options.configuredWorkingDir
      ? `${resolve(options.configuredWorkingDir)}-${options.buildId}`
      : join(
          dirname(activeOutputDir),
          ".site-build-work",
          options.environment,
          options.buildId,
        );

    await this.fs.mkdir(environmentDir, { recursive: true });
    const staleGenerations = await removeStaleUncommittedGenerations(
      this.fs,
      environmentDir,
      generationDir,
      this.staleGenerationAgeMs,
    );
    if (staleGenerations > 0) {
      this.logger.debug(
        `Removed ${staleGenerations} stale uncommitted site generation(s)`,
      );
    }
    await this.fs.rm(generationDir, { recursive: true, force: true });
    await this.fs.rm(workingDir, { recursive: true, force: true });
    await this.fs.mkdir(generationDir, { recursive: true });

    return {
      activeOutputDir,
      generationDir,
      workingDir,
      environmentDir,
      buildId: options.buildId,
    };
  }

  async commit(
    options: CommitSiteBuildOutputOptions,
  ): Promise<SiteBuildOutputCommitResult> {
    const manifest = await createSiteBuildArtifactManifest({
      generationDir: options.target.generationDir,
      preparedBuild: options.preparedBuild,
      warnings: options.warnings,
    });

    await publishGeneration(this.fs, options.target);

    try {
      await this.fs.rm(options.target.workingDir, {
        recursive: true,
        force: true,
      });
      await pruneGenerations(
        this.fs,
        options.target.environmentDir,
        options.target.generationDir,
        this.retainedGenerations,
      );
    } catch (error) {
      this.logger.warn("Published site but failed to clean old build data", {
        error,
      });
    }

    return {
      filesGenerated: manifest.files.length + 1,
      manifestPath: join(
        options.target.activeOutputDir,
        SITE_BUILD_MANIFEST_FILE,
      ),
      manifest,
    };
  }

  async abort(target: SiteBuildOutputTarget): Promise<void> {
    await Promise.allSettled([
      this.fs.rm(target.generationDir, { recursive: true, force: true }),
      this.fs.rm(target.workingDir, { recursive: true, force: true }),
    ]);
  }
}

async function publishGeneration(
  fs: SiteBuildOutputFs,
  target: SiteBuildOutputTarget,
): Promise<void> {
  const activeParent = dirname(target.activeOutputDir);
  await fs.mkdir(activeParent, { recursive: true });
  const temporaryLink = join(
    activeParent,
    `.${basename(target.activeOutputDir)}.next-${target.buildId}`,
  );
  await fs.rm(temporaryLink, { force: true });
  await fs.symlink(
    relative(activeParent, target.generationDir),
    temporaryLink,
    "dir",
  );

  const activeEntry = await lstatIfPresent(fs, target.activeOutputDir);
  if (!activeEntry) {
    try {
      await fs.rename(temporaryLink, target.activeOutputDir);
      await verifyActiveGeneration(fs, target);
      return;
    } catch (error) {
      await fs.rm(temporaryLink, { force: true });
      await fs.rm(target.activeOutputDir, { force: true });
      throw error;
    }
  }

  if (activeEntry.isSymbolicLink()) {
    const previousTarget = await fs.readlink(target.activeOutputDir);
    try {
      await fs.rename(temporaryLink, target.activeOutputDir);
      await verifyActiveGeneration(fs, target);
      return;
    } catch (error) {
      await restoreSymbolicLink(fs, target.activeOutputDir, previousTarget);
      await fs.rm(temporaryLink, { force: true });
      throw error;
    }
  }

  // One-time migration for legacy directory outputs. This sequence is
  // rollback-capable but not an atomic serving cutover; subsequent symlink
  // replacements use one atomic rename on the same filesystem.
  const legacyBackup = join(target.environmentDir, `legacy-${target.buildId}`);
  await fs.rm(legacyBackup, { recursive: true, force: true });
  await fs.rename(target.activeOutputDir, legacyBackup);
  try {
    await fs.rename(temporaryLink, target.activeOutputDir);
    await verifyActiveGeneration(fs, target);
  } catch (error) {
    await fs.rm(target.activeOutputDir, { recursive: true, force: true });
    await fs.rename(legacyBackup, target.activeOutputDir);
    await fs.rm(temporaryLink, { force: true });
    throw error;
  }
}

async function restoreSymbolicLink(
  fs: SiteBuildOutputFs,
  activeOutputDir: string,
  previousTarget: string,
): Promise<void> {
  const rollbackLink = `${activeOutputDir}.rollback`;
  await fs.rm(rollbackLink, { force: true });
  await fs.symlink(previousTarget, rollbackLink, "dir");
  await fs.rename(rollbackLink, activeOutputDir);
}

async function verifyActiveGeneration(
  fs: SiteBuildOutputFs,
  target: SiteBuildOutputTarget,
): Promise<void> {
  const activeLink = await fs.readlink(target.activeOutputDir);
  const resolvedTarget = resolve(dirname(target.activeOutputDir), activeLink);
  if (resolvedTarget !== resolve(target.generationDir)) {
    throw new Error(
      `Active site output points to unexpected generation: ${resolvedTarget}`,
    );
  }
  await fs.access(join(target.activeOutputDir, SITE_BUILD_MANIFEST_FILE));
}

async function lstatIfPresent(
  fs: SiteBuildOutputFs,
  path: string,
): Promise<SiteBuildFileType | undefined> {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    throw error;
  }
}

async function removeStaleUncommittedGenerations(
  fs: SiteBuildOutputFs,
  environmentDir: string,
  currentGenerationDir: string,
  staleGenerationAgeMs: number,
): Promise<number> {
  const entries = await fs.readdir(environmentDir, { withFileTypes: true });
  const now = Date.now();
  const staleDirectories: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("legacy-")) continue;
    const path = join(environmentDir, entry.name);
    if (resolve(path) === resolve(currentGenerationDir)) continue;
    if (await hasArtifactManifest(fs, path)) continue;
    const stat = await fs.stat(path);
    if (now - stat.mtimeMs < staleGenerationAgeMs) continue;
    staleDirectories.push(path);
  }

  await Promise.all(
    staleDirectories.map((path) =>
      fs.rm(path, { recursive: true, force: true }),
    ),
  );
  return staleDirectories.length;
}

async function hasArtifactManifest(
  fs: SiteBuildOutputFs,
  directory: string,
): Promise<boolean> {
  try {
    await fs.access(join(directory, SITE_BUILD_MANIFEST_FILE));
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

async function pruneGenerations(
  fs: SiteBuildOutputFs,
  environmentDir: string,
  activeGenerationDir: string,
  retainedGenerations: number,
): Promise<void> {
  const entries = await fs.readdir(environmentDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(environmentDir, entry.name);
        try {
          await fs.access(join(path, SITE_BUILD_MANIFEST_FILE));
          const stat = await fs.stat(path);
          return { path, modifiedAt: stat.mtimeMs };
        } catch {
          // Never prune legacy backups, in-progress generations, or a
          // generation that vanished after its manifest was observed.
          return undefined;
        }
      }),
  );
  const directories = candidates.filter(
    (candidate): candidate is { path: string; modifiedAt: number } =>
      candidate !== undefined,
  );
  directories.sort((left, right) => right.modifiedAt - left.modifiedAt);

  const retained = new Set<string>([resolve(activeGenerationDir)]);
  for (const directory of directories) {
    if (retained.size >= retainedGenerations) break;
    retained.add(resolve(directory.path));
  }
  await Promise.all(
    directories
      .filter((directory) => !retained.has(resolve(directory.path)))
      .map((directory) =>
        fs.rm(directory.path, { recursive: true, force: true }),
      ),
  );
}

function assertSafeBuildId(buildId: string): void {
  if (
    !/^[A-Za-z0-9._-]+$/.test(buildId) ||
    buildId === "." ||
    buildId === ".."
  ) {
    throw new Error(`Unsafe site build id: ${buildId}`);
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
