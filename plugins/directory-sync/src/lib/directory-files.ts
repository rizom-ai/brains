import type { ServiceEntityMirrorClient } from "@brains/sdk/internal/service-runtime";
import type { FileOperations } from "./file-operations";

export async function getDirectoryMarkdownFiles(
  fileOperations: FileOperations,
): Promise<string[]> {
  return fileOperations.getAllMarkdownFiles();
}

export async function ensureDirectoryEntityStructure(
  fileOperations: FileOperations,
  entityService: ServiceEntityMirrorClient,
  configuredEntityTypes: string[] | undefined,
): Promise<void> {
  const entityTypes = configuredEntityTypes ?? entityService.getEntityTypes();
  await fileOperations.ensureDirectoryStructure(entityTypes);
}
