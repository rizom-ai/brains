import type {
  RuntimeStudioWorkspaceData,
  UserPermissionLevel,
} from "@brains/plugins";

/**
 * Typed client for the Studio editor API served by plugins/studio.
 * Routes live under the configured Studio path and require an authenticated browser session.
 */

export interface StudioTypeCapabilities {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExtract: boolean;
  canPublish: boolean;
  canAssist: boolean;
}

export interface EntityTypeInfo {
  entityType: string;
  label: string;
  isSingleton: boolean;
  hasBody: boolean;
  count: number;
  capabilities: StudioTypeCapabilities;
}

export interface StudioWorkspaceInfo {
  id: string;
  pluginId: string;
  label: string;
  rendererName:
    | "DeclarativeOperatorWorkspace"
    | "StudioAccountWorkspace"
    | "StudioChatWorkspace";
  priority: number;
  permission: UserPermissionLevel;
  urlQuery?: true;
  chatApiPath?: string;
  aliases?: readonly {
    id: string;
    query: Readonly<Record<string, string>>;
  }[];
  entityTypes: string[];
  badge?: number;
}

export interface StudioNavigation {
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
}

export interface StudioWorkspaceData {
  id: string;
  rendererName: "DeclarativeOperatorWorkspace";
  data: RuntimeStudioWorkspaceData;
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
  condition?: { field: string; value: unknown };
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

let studioApiBasePath = "/studio";

/** Configure the API mount from the server-rendered Studio shell. */
export function configureStudioApiBasePath(routePath: string): void {
  studioApiBasePath = routePath === "/" ? "" : routePath.replace(/\/+$/, "");
}

export function studioApiPath(suffix: string, routePath?: string): string {
  const pathname = routePath ?? studioApiBasePath;
  const base = pathname === "/" ? "" : pathname.replace(/\/+$/, "");
  return `${base}/api/${suffix.replace(/^\/+/, "")}`;
}

function apiErrorPayload(payload: unknown): {
  error: string | undefined;
  issues: ValidationIssue[];
} {
  if (typeof payload !== "object" || payload === null) {
    return { error: undefined, issues: [] };
  }
  const error =
    "error" in payload && typeof payload.error === "string"
      ? payload.error
      : undefined;
  const issues =
    "issues" in payload && Array.isArray(payload.issues)
      ? payload.issues.filter(
          (issue): issue is ValidationIssue =>
            typeof issue === "object" &&
            issue !== null &&
            "message" in issue &&
            typeof issue.message === "string",
        )
      : [];
  return { error, issues };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const details = apiErrorPayload(payload);
    throw new ApiError(
      response.status,
      details.error ?? response.statusText,
      details.issues,
    );
  }
  return payload;
}

export async function fetchNavigation(): Promise<StudioNavigation> {
  const response = await requestJson<{
    types: EntityTypeInfo[];
    workspaces?: StudioWorkspaceInfo[];
  }>(studioApiPath("types"));
  return { types: response.types, workspaces: response.workspaces ?? [] };
}

export async function fetchTypes(): Promise<EntityTypeInfo[]> {
  return (await fetchNavigation()).types;
}

export async function fetchWorkspace(
  id: string,
  query: Readonly<Record<string, string | number | undefined>> = {},
): Promise<StudioWorkspaceData> {
  const search = new URLSearchParams({ id });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const { workspace } = await requestJson<{ workspace: StudioWorkspaceData }>(
    studioApiPath(`workspace?${search.toString()}`),
  );
  return workspace;
}

export async function runWorkspaceAction<TResult>(
  id: string,
  action: unknown,
): Promise<TResult> {
  const { result } = await requestJson<{ result: TResult }>(
    studioApiPath("workspace"),
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
    studioApiPath(`schema?type=${encodeURIComponent(entityType)}`),
  );
}

export async function fetchEntities(
  entityType: string,
): Promise<EntitySummary[]> {
  const { entities } = await requestJson<{ entities: EntitySummary[] }>(
    studioApiPath(`entities?type=${encodeURIComponent(entityType)}`),
  );
  return entities;
}

export async function fetchEntity(
  entityType: string,
  id: string,
): Promise<EntityDetail> {
  const { entity } = await requestJson<{ entity: EntityDetail }>(
    studioApiPath(
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
    studioApiPath("entities"),
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
    studioApiPath("entities"),
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
    studioApiPath("upload"),
    {
      method: "POST",
      body: form,
    },
  );
}

export async function requestAssist(input: {
  entityType: string;
  id: string;
  instruction: string;
  selection: string;
}): Promise<{ suggestion: string }> {
  return requestJson<{ suggestion: string }>(studioApiPath("assist"), {
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
  id: string;
  targetField: string;
}): Promise<FieldAssistResponse> {
  return requestJson<FieldAssistResponse>(studioApiPath("assist"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchAgentTargets(
  entityType: string,
  id: string,
): Promise<AgentTarget[]> {
  const { agents } = await requestJson<{ agents: AgentTarget[] }>(
    studioApiPath(
      `agents?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
    ),
  );
  return agents;
}

export async function requestAgentAnswer(input: {
  entityType: string;
  id: string;
  agent: string;
  instruction: string;
  selection: string;
}): Promise<{ agentId: string; response: string }> {
  return requestJson<{ agentId: string; response: string }>(
    studioApiPath("ask-agent"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  return requestJson<SyncStatus>(studioApiPath("sync-status"));
}

export async function deleteEntity(
  entityType: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    studioApiPath(
      `entities?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
    ),
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    },
  );
}
