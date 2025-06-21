import { copyFile, mkdir, readdir } from "fs/promises";
import { join } from "path";

/**
 * Recursively copy a directory
 */
export async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules
      if (entry.name === "node_modules") {
        continue;
      }
      await copyDirectory(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}
