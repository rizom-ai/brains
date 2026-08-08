import {
  createEntity,
  deleteEntity,
  runWorkspaceAction,
  updateEntity,
  uploadFile,
  type DirectorySyncWorkspaceAction,
  type DirectorySyncWorkspaceActionResult,
  type InboxWorkspaceAction,
  type InboxWorkspaceActionResult,
  type MailTriageStatusAction,
  type MailTriageStatusActionResult,
  type PublishingAction,
  type PublishingActionResult,
  type SiteWorkspaceAction,
  type SiteWorkspaceActionResult,
} from "./api";

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

export interface CmsWorkspaceActionInput {
  workspaceId: string;
  action: PublishingAction;
}

export interface SiteWorkspaceActionInput {
  workspaceId: string;
  action: SiteWorkspaceAction;
}

export interface DirectorySyncWorkspaceActionInput {
  workspaceId: string;
  action: DirectorySyncWorkspaceAction;
}

export interface MailTriageWorkspaceActionInput {
  workspaceId: string;
  action: MailTriageStatusAction;
}

export interface InboxWorkspaceActionInput {
  workspaceId: string;
  action: InboxWorkspaceAction;
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

export function runCmsWorkspaceAction(
  input: CmsWorkspaceActionInput,
): Promise<PublishingActionResult> {
  return runWorkspaceAction<PublishingActionResult>(
    input.workspaceId,
    input.action,
  );
}

export function runSiteWorkspaceAction(
  input: SiteWorkspaceActionInput,
): Promise<SiteWorkspaceActionResult> {
  return runWorkspaceAction<SiteWorkspaceActionResult>(
    input.workspaceId,
    input.action,
  );
}

export function runDirectorySyncWorkspaceAction(
  input: DirectorySyncWorkspaceActionInput,
): Promise<DirectorySyncWorkspaceActionResult> {
  return runWorkspaceAction<DirectorySyncWorkspaceActionResult>(
    input.workspaceId,
    input.action,
  );
}

export function runMailTriageWorkspaceAction(
  input: MailTriageWorkspaceActionInput,
): Promise<MailTriageStatusActionResult> {
  return runWorkspaceAction<MailTriageStatusActionResult>(
    input.workspaceId,
    input.action,
  );
}

export function runInboxWorkspaceAction(
  input: InboxWorkspaceActionInput,
): Promise<InboxWorkspaceActionResult> {
  return runWorkspaceAction<InboxWorkspaceActionResult>(
    input.workspaceId,
    input.action,
  );
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
