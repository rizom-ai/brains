/**
 * Typed client for the CMS editor API served by plugins/cms.
 * Routes live under the configured CMS path and require an operator session cookie.
 */

export interface EntityTypeInfo {
  entityType: string;
  label: string;
  isSingleton: boolean;
  hasBody: boolean;
  count: number;
}

export interface CmsWorkspaceInfo {
  id: string;
  pluginId: string;
  label: string;
  rendererName: string;
  entityTypes: string[];
}

export interface CmsNavigation {
  types: EntityTypeInfo[];
  workspaces: CmsWorkspaceInfo[];
}

export interface PublicationQueueItem {
  entityId: string;
  entityType: string;
  title: string;
  position: number;
  queuedAt: string;
  destination: string;
  scheduledFor?: string;
}

export interface PublicationJobItem {
  id: string;
  label: string;
  target: string;
  status: "pending" | "processing";
}

export interface PublicationFailureItem {
  entityId: string;
  entityType: string;
  title: string;
  error: string;
  retryCount: number;
}

export interface PublicationPipelineSnapshot {
  summary: {
    draft: number;
    queued: number;
    generating: number;
    failed: number;
    published: number;
    needsOperator: number;
  };
  queue: PublicationQueueItem[];
  generating: PublicationJobItem[];
  failures: PublicationFailureItem[];
  publishableEntityTypes: string[];
}

export interface CmsWorkspaceData {
  id: string;
  rendererName: string;
  data: PublicationPipelineSnapshot;
}

export interface PublishConfirmationArgs {
  confirmed: true;
  confirmationToken: string;
  contentHash: string;
  expiresAt: string;
}

interface PublishingTargetAction {
  entityType: string;
  entityId: string;
}

export type PublishingAction =
  | ({ type: "queue" | "remove" | "retry" } & PublishingTargetAction)
  | ({ type: "reorder"; position: number } & PublishingTargetAction)
  | ({
      type: "publish";
      confirmation?: PublishConfirmationArgs;
    } & PublishingTargetAction);

export type PublishingActionResult =
  | { success: true; [key: string]: unknown }
  | { success: false; error: string; code?: string }
  | {
      needsConfirmation: true;
      summary: string;
      preview?: string;
      args: PublishConfirmationArgs;
    }
  | { position: number };

export interface FieldDescriptor {
  name: string;
  label: string;
  widget: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  field?: FieldDescriptor;
  fields?: FieldDescriptor[];
}

export interface TypeSchema {
  entityType: string;
  format: "raw" | "frontmatter";
  isSingleton: boolean;
  hasBody: boolean;
  fields: FieldDescriptor[];
}

export interface EntitySummary {
  id: string;
  entityType: string;
  frontmatter: Record<string, unknown>;
  updated: string;
}

export interface EntityDetail extends EntitySummary {
  body: string;
  contentHash: string;
  created: string;
}

export interface AgentTarget {
  id: string;
  label: string;
}

export interface GitSyncState {
  branch: string;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  lastCommit: string | null;
  remote: string | null;
}

/**
 * Where the save pipeline stands beyond the entity db: whether directory-sync
 * is running (file export) and what git looks like (commit). Either half is
 * null when the corresponding plugin is absent.
 */
export interface SyncStatus {
  directorySync: { lastSync: string | null; watching: boolean } | null;
  git: GitSyncState | null;
}

export interface ValidationIssue {
  path: Array<string | number>;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly issues: ValidationIssue[];

  constructor(status: number, message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

export function cmsApiPath(suffix: string, routePath?: string): string {
  const pathname =
    routePath ??
    (typeof window === "undefined" ? "/cms" : window.location.pathname);
  const base = pathname === "/" ? "" : pathname.replace(/\/+$/, "");
  return `${base}/api/${suffix.replace(/^\/+/, "")}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const record = (payload ?? {}) as {
      error?: string;
      issues?: ValidationIssue[];
    };
    throw new ApiError(
      response.status,
      record.error ?? response.statusText,
      record.issues ?? [],
    );
  }
  return payload as T;
}

export async function fetchNavigation(): Promise<CmsNavigation> {
  const response = await requestJson<{
    types: EntityTypeInfo[];
    workspaces?: CmsWorkspaceInfo[];
  }>(cmsApiPath("types"));
  return { types: response.types, workspaces: response.workspaces ?? [] };
}

export async function fetchTypes(): Promise<EntityTypeInfo[]> {
  return (await fetchNavigation()).types;
}

export async function fetchWorkspace(id: string): Promise<CmsWorkspaceData> {
  const { workspace } = await requestJson<{ workspace: CmsWorkspaceData }>(
    cmsApiPath(`workspace?id=${encodeURIComponent(id)}`),
  );
  return workspace;
}

export async function runWorkspaceAction(
  id: string,
  action: PublishingAction,
): Promise<PublishingActionResult> {
  const { result } = await requestJson<{ result: PublishingActionResult }>(
    cmsApiPath("workspace"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    },
  );
  return result;
}

export async function fetchSchema(entityType: string): Promise<TypeSchema> {
  return requestJson<TypeSchema>(
    cmsApiPath(`schema?type=${encodeURIComponent(entityType)}`),
  );
}

export async function fetchEntities(
  entityType: string,
): Promise<EntitySummary[]> {
  const { entities } = await requestJson<{ entities: EntitySummary[] }>(
    cmsApiPath(`entities?type=${encodeURIComponent(entityType)}`),
  );
  return entities;
}

export async function fetchEntity(
  entityType: string,
  id: string,
): Promise<EntityDetail> {
  const { entity } = await requestJson<{ entity: EntityDetail }>(
    cmsApiPath(
      `entities?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
    ),
  );
  return entity;
}

export async function updateEntity(input: {
  entityType: string;
  id: string;
  frontmatter: Record<string, unknown>;
  body?: string;
  baseContentHash?: string;
}): Promise<{ entityId: string; jobId: string; skipped: boolean }> {
  return requestJson<{ entityId: string; jobId: string; skipped: boolean }>(
    cmsApiPath("entities"),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function createEntity(input: {
  entityType: string;
  frontmatter: Record<string, unknown>;
  body?: string;
}): Promise<{ entityId: string; jobId: string }> {
  return requestJson<{ entityId: string; jobId: string }>(
    cmsApiPath("entities"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function uploadFile(
  file: File,
): Promise<{ entityId: string; jobId?: string }> {
  const form = new FormData();
  form.set("file", file);
  return requestJson<{ entityId: string; jobId?: string }>(
    cmsApiPath("upload"),
    {
      method: "POST",
      body: form,
    },
  );
}

export async function requestAssist(input: {
  entityType: string;
  instruction: string;
  selection: string;
  body: string;
  frontmatter: Record<string, unknown>;
}): Promise<{ suggestion: string }> {
  return requestJson<{ suggestion: string }>(cmsApiPath("assist"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type FieldAssistResponse =
  | {
      variant: "summarise";
      targetField: string;
      suggestion: string;
    }
  | {
      variant: "tag-suggest";
      targetField: string;
      suggestions: string[];
    };

export async function requestFieldAssist(input: {
  variant: "summarise" | "tag-suggest";
  entityType: string;
  targetField: string;
  body: string;
  frontmatter: Record<string, unknown>;
}): Promise<FieldAssistResponse> {
  return requestJson<FieldAssistResponse>(cmsApiPath("assist"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchAgentTargets(): Promise<AgentTarget[]> {
  const { agents } = await requestJson<{ agents: AgentTarget[] }>(
    cmsApiPath("agents"),
  );
  return agents;
}

export async function requestAgentAnswer(input: {
  agent: string;
  instruction: string;
  selection: string;
}): Promise<{ agentId: string; response: string }> {
  return requestJson<{ agentId: string; response: string }>(
    cmsApiPath("ask-agent"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  return requestJson<SyncStatus>(cmsApiPath("sync-status"));
}

export async function deleteEntity(
  entityType: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    cmsApiPath(
      `entities?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
    ),
    { method: "DELETE" },
  );
}
