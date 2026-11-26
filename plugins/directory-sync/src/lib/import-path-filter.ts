import type { ServiceEntityMirrorClient } from "@brains/sdk/internal/service-runtime";
import type { FileOperations } from "./file-operations";

export interface ImportPathFilterDeps {
  entityService: ServiceEntityMirrorClient;
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

  // A type kept out of the content repo has no files: one placed in its
  // folder is nobody's record.
  if (
    deps.entityService.getEntityTypeConfig(entityType).contentRepo === false
  ) {
    return { skip: true, countSkipped: true };
  }

  // A YAML file under a markdown type's folder is not an entity's: it is
  // left alone (docs/external-plugin-authoring.md, The stored format).
  if (
    filePath.endsWith(".yaml") &&
    !deps.fileOperations.isEntityFile(filePath)
  ) {
    return { skip: true, countSkipped: false };
  }

  return { skip: false, countSkipped: false };
}
