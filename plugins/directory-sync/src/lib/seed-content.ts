import { readdir, mkdir, copyFile } from "fs/promises";
import { join, resolve } from "path";
import type { Logger } from "@brains/utils";
import { pathExists } from "./fs-utils";
import { hasGitHead } from "./git-repository";

/**
 * Check whether a brain-data directory is effectively empty.
 *
 * Returns false (not empty) when:
 * - The directory contains content files (excluding dotfiles / underscore dirs)
 * - The directory has git history already
 *
 * A repo with a configured remote but no commits yet is still considered empty
 * so seed content can bootstrap the first commit.
 */
export async function isBrainDataEmpty(
  brainDataPath: string,
  logger: Logger,
): Promise<boolean> {
  if (!(await pathExists(brainDataPath))) {
    return true;
  }

  const files = await readdir(brainDataPath);
  const contentFiles = files.filter(
    (f) => !f.startsWith(".") && !f.startsWith("_"),
  );

  if (contentFiles.length > 0) {
    return false;
  }

  if (await hasGitHead(brainDataPath)) {
    logger.debug(
      "Git repository with history detected - skipping seed content",
      {
        path: brainDataPath,
      },
    );
    return false;
  }

  return true;
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!(await pathExists(destPath))) {
        await mkdir(destPath, { recursive: true });
      }
      await copyDirectory(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Copy seed content into the brain-data directory if it is empty and
 * a seed-content directory exists.
 *
 * When seedContentPath is provided (e.g. from a brain model package),
 * it is used directly. Otherwise falls back to `${CWD}/seed-content`.
 */
export async function copySeedContentIfNeeded(
  dataDir: string,
  logger: Logger,
  seedContentPath?: string,
): Promise<void> {
  const brainDataPath = resolve(process.cwd(), dataDir);
  seedContentPath = seedContentPath
    ? resolve(seedContentPath)
    : resolve(process.cwd(), "seed-content");

  const isEmpty = await isBrainDataEmpty(brainDataPath, logger);

  if (isEmpty && (await pathExists(seedContentPath))) {
    logger.debug("Copying seed content to brain-data directory");
    await copyDirectory(seedContentPath, brainDataPath);
    logger.debug("Seed content copied successfully");
  } else if (isEmpty) {
    logger.debug(
      "No seed content directory found, starting with empty brain-data",
    );
  } else {
    logger.debug("brain-data directory not empty, skipping seed content");
  }
}
