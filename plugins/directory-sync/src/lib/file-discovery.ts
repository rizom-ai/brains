import { join } from "path";
import { mkdir, readdir, stat } from "fs/promises";
import type { DirectorySyncStatus } from "../types";
import { isImageFile } from "./image-file-utils";
import { parseEntityPath } from "./entity-paths";
import { pathExists } from "./fs-utils";

export interface EntityTypeRegistry {
  hasEntityType(type: string): boolean;
}

export async function getAllMarkdownFiles(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
): Promise<string[]> {
  return findFiles(syncPath, entityRegistry, { includeImages: false });
}

export async function getAllSyncFiles(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
): Promise<string[]> {
  return findFiles(syncPath, entityRegistry, { includeImages: true });
}

export async function ensureDirectoryStructure(
  syncPath: string,
  entityTypes: string[],
): Promise<void> {
  if (!(await pathExists(syncPath))) {
    await mkdir(syncPath, { recursive: true });
  }

  for (const entityType of entityTypes) {
    if (entityType !== "base") {
      await mkdir(join(syncPath, entityType), { recursive: true });
    }
  }
}

export async function gatherFileStatus(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
): Promise<{
  files: DirectorySyncStatus["files"];
  stats: DirectorySyncStatus["stats"];
}> {
  const files: DirectorySyncStatus["files"] = [];
  const stats: DirectorySyncStatus["stats"] = {
    totalFiles: 0,
    byEntityType: {},
  };

  if (!(await pathExists(syncPath))) {
    return { files, stats };
  }

  const allFiles = await getAllMarkdownFiles(syncPath, entityRegistry);

  for (const filePath of allFiles) {
    try {
      const fullPath = join(syncPath, filePath);
      const fileStat = await stat(fullPath);
      const { entityType } = parseEntityPath(syncPath, filePath);

      files.push({
        path: filePath,
        entityType,
        modified: fileStat.mtime,
      });

      stats.totalFiles++;
      stats.byEntityType[entityType] =
        (stats.byEntityType[entityType] ?? 0) + 1;
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return { files, stats };
}

async function findFiles(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
  opts: { includeImages: boolean },
): Promise<string[]> {
  const files: string[] = [];
  if (!(await pathExists(syncPath))) return files;

  const walk = async (
    currentPath: string,
    relativePath: string = "",
    inImageDir: boolean = false,
  ): Promise<void> => {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relativePath ? join(relativePath, entry.name) : entry.name;

      if (entry.isFile() && !entry.name.endsWith(".invalid")) {
        if (entry.name.endsWith(".md")) {
          files.push(rel);
        } else if (
          opts.includeImages &&
          inImageDir &&
          isImageFile(entry.name)
        ) {
          files.push(rel);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        // At root level, only walk into registered entity type directories
        if (relativePath === "" && !entityRegistry.hasEntityType(entry.name)) {
          continue;
        }
        const entryPath = join(currentPath, entry.name);
        const isImgDir = entry.name === "image" && relativePath === "";
        await walk(entryPath, rel, inImageDir || isImgDir);
      }
    }
  };

  await walk(syncPath);
  return files;
}
