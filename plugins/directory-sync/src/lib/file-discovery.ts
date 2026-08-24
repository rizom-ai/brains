import { join } from "path";
import { mkdir, readdir, stat } from "fs/promises";
import type { DirectorySyncStatus } from "../types";
import { isImageFile } from "./image-file-utils";
import { isDocumentFile, isDocumentSidecarFile } from "./document-file-utils";
import { parseEntityPath } from "./entity-paths";
import { pathExists } from "./fs-utils";

export interface EntityTypeRegistry {
  hasEntityType(type: string): boolean;
}

/**
 * Fail before seed import when fixture directories name entity types this
 * brain did not register. Normal vaults may contain unrelated directories,
 * so callers opt into this stricter contract for curated seed content.
 */
export async function validateSeedContentEntityTypes(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
): Promise<void> {
  if (!(await pathExists(syncPath))) return;

  const entries = await readdir(syncPath, { withFileTypes: true });
  const entityTypes = new Set<string>();
  if (
    entries.some(
      (entry) =>
        entry.isFile() &&
        !entry.name.endsWith(".invalid") &&
        entry.name.endsWith(".md"),
    )
  ) {
    entityTypes.add("note");
  }

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      entry.name.startsWith("_")
    ) {
      continue;
    }
    if (await containsSyncFile(join(syncPath, entry.name), entry.name)) {
      entityTypes.add(entry.name);
    }
  }

  const unregistered = [...entityTypes]
    .filter((entityType) => !entityRegistry.hasEntityType(entityType))
    .sort();
  if (unregistered.length > 0) {
    throw new Error(
      `Seed content contains unregistered entity types: ${unregistered.join(", ")}`,
    );
  }
}

export async function getAllMarkdownFiles(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
): Promise<string[]> {
  return findFiles(syncPath, entityRegistry, {
    includeDocuments: false,
    includeImages: false,
  });
}

export async function getAllSyncFiles(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
): Promise<string[]> {
  return findFiles(syncPath, entityRegistry, {
    includeDocuments: true,
    includeImages: true,
  });
}

export async function ensureDirectoryStructure(
  syncPath: string,
  entityTypes: string[],
): Promise<void> {
  if (!(await pathExists(syncPath))) {
    await mkdir(syncPath, { recursive: true });
  }

  for (const entityType of entityTypes) {
    if (entityType !== "note") {
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

async function containsSyncFile(
  directory: string,
  rootEntityType: string,
): Promise<boolean> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.endsWith(".invalid")) continue;
    if (entry.isDirectory()) {
      if (await containsSyncFile(join(directory, entry.name), rootEntityType)) {
        return true;
      }
      continue;
    }
    if (!entry.isFile() || isDocumentSidecarFile(entry.name)) continue;
    if (entry.name.endsWith(".md")) return true;
    if (rootEntityType === "image" && isImageFile(entry.name)) return true;
    if (rootEntityType === "document" && isDocumentFile(entry.name)) {
      return true;
    }
  }
  return false;
}

async function findFiles(
  syncPath: string,
  entityRegistry: EntityTypeRegistry,
  opts: { includeDocuments: boolean; includeImages: boolean },
): Promise<string[]> {
  const files: string[] = [];
  if (!(await pathExists(syncPath))) return files;

  const walk = async (
    currentPath: string,
    relativePath: string = "",
    inImageDir: boolean = false,
    inDocumentDir: boolean = false,
  ): Promise<void> => {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relativePath ? join(relativePath, entry.name) : entry.name;

      if (
        entry.isFile() &&
        !entry.name.endsWith(".invalid") &&
        !isDocumentSidecarFile(entry.name)
      ) {
        if (entry.name.endsWith(".md")) {
          files.push(rel);
        } else if (
          opts.includeImages &&
          inImageDir &&
          isImageFile(entry.name)
        ) {
          files.push(rel);
        } else if (
          opts.includeDocuments &&
          inDocumentDir &&
          isDocumentFile(entry.name)
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
        const isDocDir = entry.name === "document" && relativePath === "";
        await walk(
          entryPath,
          rel,
          inImageDir || isImgDir,
          inDocumentDir || isDocDir,
        );
      }
    }
  };

  await walk(syncPath);
  return files;
}
