import { copyFile, mkdir, readdir, stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Recursively copy a directory from source to destination
 */
export async function copyDirectory(src: string, dest: string): Promise<void> {
  // Create destination directory if it doesn't exist
  if (!existsSync(dest)) {
    await mkdir(dest, { recursive: true });
  }

  // Read all items in source directory
  const items = await readdir(src);

  // Copy each item
  for (const item of items) {
    const srcPath = join(src, item);
    const destPath = join(dest, item);

    const itemStat = await stat(srcPath);

    if (itemStat.isDirectory()) {
      // Skip node_modules and .astro directories
      if (item === "node_modules" || item === ".astro" || item === "dist") {
        continue;
      }
      // Recursively copy subdirectory
      await copyDirectory(srcPath, destPath);
    } else {
      // Skip certain files
      if (
        item === "bun.lock" ||
        item === "package-lock.json" ||
        item.endsWith(".yaml")
      ) {
        continue;
      }
      // Copy file
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Clean up a directory by removing it if it exists
 */
export async function cleanDirectory(dir: string): Promise<void> {
  if (existsSync(dir)) {
    const { rm } = await import("fs/promises");
    await rm(dir, { recursive: true, force: true });
  }
}
