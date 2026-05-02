import type { IEntityService } from "@brains/plugins";
import type { FileOperations } from "./file-operations";

export interface ImportPathFilterDeps {
  entityService: IEntityService;
  fileOperations: FileOperations;
  entityTypes?: string[] | undefined;
}

export interface ImportPathDecision {
  skip: boolean;
  countSkipped: boolean;
}

export function getImportPathDecision(
  deps: ImportPathFilterDeps,
  filePath: string,
): ImportPathDecision {
  if (filePath.endsWith(".invalid")) {
    return { skip: true, countSkipped: false };
  }

  // Skip git rename-format paths (e.g., "{old.md => new.md}")
  if (filePath.includes("{")) {
    return { skip: true, countSkipped: true };
  }

  // Validate entity type before reading file to avoid noisy errors
  // for paths in non-entity directories (e.g., _obsidian/)
  const { entityType } = deps.fileOperations.parseEntityFromPath(filePath);

  if (deps.entityTypes && !deps.entityTypes.includes(entityType)) {
    return { skip: true, countSkipped: true };
  }

  if (!deps.entityService.hasEntityType(entityType)) {
    return { skip: true, countSkipped: true };
  }

  return { skip: false, countSkipped: false };
}
