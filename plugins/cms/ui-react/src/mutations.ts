import { createEntity, deleteEntity, updateEntity, uploadFile } from "./api";

export type SaveEntityInput =
  | {
      kind: "create";
      entityType: string;
      frontmatter: Record<string, unknown>;
      body?: string;
    }
  | {
      kind: "update";
      entityType: string;
      id: string;
      frontmatter: Record<string, unknown>;
      body?: string;
      baseContentHash: string;
    };

export interface DeleteEntityInput {
  entityType: string;
  id: string;
}

export interface UploadImageResult {
  entityId: string;
  jobId?: string;
}

export interface SaveEntityResult {
  entityId: string;
  jobId: string;
  skipped?: boolean;
}

export function uploadImage(file: File): Promise<UploadImageResult> {
  return uploadFile(file);
}

export function removeEntity(
  input: DeleteEntityInput,
): Promise<{ deleted: boolean }> {
  return deleteEntity(input.entityType, input.id);
}

export function saveEntity(input: SaveEntityInput): Promise<SaveEntityResult> {
  const body = input.body === undefined ? {} : { body: input.body };
  if (input.kind === "create") {
    return createEntity({
      entityType: input.entityType,
      frontmatter: input.frontmatter,
      ...body,
    });
  }
  return updateEntity({
    entityType: input.entityType,
    id: input.id,
    frontmatter: input.frontmatter,
    baseContentHash: input.baseContentHash,
    ...body,
  });
}
