import { existsSync, readdirSync, mkdirSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import { join, resolve } from "path";
import type { Logger } from "@brains/utils";

/**
 * Check whether a brain-data directory is effectively empty.
 *
 * Returns false (not empty) when:
 * - The directory contains content files (excluding .git and .gitkeep)
 * - The directory has a .git folder with a configured remote (git-sync will pull data)
 */
export function isBrainDataEmpty(
  brainDataPath: string,
  logger: Logger,
): boolean {
  if (!existsSync(brainDataPath)) {
    return true;
  }

  const files = readdirSync(brainDataPath);
  const contentFiles = files.filter((f) => f !== ".git" && f !== ".gitkeep");

  if (contentFiles.length > 0) {
    return false;
  }

  if (hasGitRemote(brainDataPath)) {
    logger.debug(
      "Git repository with remote detected - skipping seed content",
      { path: brainDataPath },
    );
    return false;
  }

  return true;
}

function hasGitRemote(dirPath: string): boolean {
  const gitDir = join(dirPath, ".git");
  if (!existsSync(gitDir)) {
    return false;
  }

  try {
    const result = execSync("git remote", {
      cwd: dirPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      await copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copy seed content into the brain-data directory if it is empty and
 * a seed-content directory exists at the project root.
 */
export async function copySeedContentIfNeeded(
  dataDir: string,
  logger: Logger,
): Promise<void> {
  const brainDataPath = resolve(process.cwd(), dataDir);
  const seedContentPath = resolve(process.cwd(), "seed-content");

  const isEmpty = isBrainDataEmpty(brainDataPath, logger);

  if (isEmpty && existsSync(seedContentPath)) {
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
