import type {
  RuntimeStudioWorkspaceData,
  UserPermissionLevel,
} from "@brains/plugins";
import type { FetchLike } from "@brains/utils/fetch-like";

/**
 * Typed client for the Studio editor API served by plugins/studio.
 * Routes live under the Studio mount the client was built with and require
 * an authenticated browser session.
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

/** Resolve an API path under the Studio mount the server rendered. */
export function studioApiPath(suffix: string, routePath: string): string {
  const base = routePath === "/" ? "" : routePath.replace(/\/+$/, "");
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

/**
 * What the client needs at runtime that is not a route: the Studio mount it
 * was served under, and the transport its requests go through. Production
 * leaves fetch unset and the client uses the global; a test hands in a fake
 * and reads the requests off it instead of reassigning globalThis.fetch.
 */
export interface StudioApiDeps {
  basePath: string;
  fetch?: FetchLike | undefined;
}

const globalFetch: FetchLike = (input, init) => fetch(input, init);

export class StudioApi {
  private readonly basePath: string;
  /**
   * The transport this client was built on. The lazily loaded account
   * surface builds its own client on it, so its code stays out of the
   * entry chunk.
   */
  readonly fetch: FetchLike;

  constructor(deps: StudioApiDeps) {
    this.basePath = deps.basePath;
    this.fetch = deps.fetch ?? globalFetch;
  }

  private path(suffix: string): string {
    return studioApiPath(suffix, this.basePath);
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetch(path, init);
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

  async fetchNavigation(): Promise<StudioNavigation> {
    const response = await this.requestJson<{
      types: EntityTypeInfo[];
      workspaces?: StudioWorkspaceInfo[];
    }>(this.path("types"));
    return { types: response.types, workspaces: response.workspaces ?? [] };
  }

  async fetchTypes(): Promise<EntityTypeInfo[]> {
    return (await this.fetchNavigation()).types;
  }

  async fetchWorkspace(
    id: string,
    query: Readonly<Record<string, string | number | undefined>> = {},
  ): Promise<StudioWorkspaceData> {
    const search = new URLSearchParams({ id });
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) search.set(key, String(value));
    }
    const { workspace } = await this.requestJson<{
      workspace: StudioWorkspaceData;
    }>(this.path(`workspace?${search.toString()}`));
    return workspace;
  }

  async runWorkspaceAction<TResult>(
    id: string,
    action: unknown,
  ): Promise<TResult> {
    const { result } = await this.requestJson<{ result: TResult }>(
      this.path("workspace"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      },
    );
    return result;
  }

  async fetchSchema(entityType: string): Promise<TypeSchema> {
    return this.requestJson<TypeSchema>(
      this.path(`schema?type=${encodeURIComponent(entityType)}`),
    );
  }

  async fetchEntities(entityType: string): Promise<EntitySummary[]> {
    const { entities } = await this.requestJson<{ entities: EntitySummary[] }>(
      this.path(`entities?type=${encodeURIComponent(entityType)}`),
    );
    return entities;
  }

  async fetchEntity(entityType: string, id: string): Promise<EntityDetail> {
    const { entity } = await this.requestJson<{ entity: EntityDetail }>(
      this.path(
        `entities?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
      ),
    );
    return entity;
  }

  async updateEntity(input: {
    entityType: string;
    id: string;
    frontmatter: Record<string, unknown>;
    body?: string;
    baseContentHash?: string;
  }): Promise<{ entityId: string; jobId: string; skipped: boolean }> {
    return this.requestJson<{
      entityId: string;
      jobId: string;
      skipped: boolean;
    }>(this.path("entities"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async createEntity(input: {
    entityType: string;
    frontmatter: Record<string, unknown>;
    body?: string;
  }): Promise<{ entityId: string; jobId: string }> {
    return this.requestJson<{ entityId: string; jobId: string }>(
      this.path("entities"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
  }

  async uploadFile(file: File): Promise<{ entityId: string; jobId?: string }> {
    const form = new FormData();
    form.set("file", file);
    return this.requestJson<{ entityId: string; jobId?: string }>(
      this.path("upload"),
      {
        method: "POST",
        body: form,
      },
    );
  }

  async requestAssist(input: {
    entityType: string;
    id: string;
    instruction: string;
    selection: string;
  }): Promise<{ suggestion: string }> {
    return this.requestJson<{ suggestion: string }>(this.path("assist"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async requestFieldAssist(input: {
    variant: "summarise" | "tag-suggest";
    entityType: string;
    id: string;
    targetField: string;
  }): Promise<FieldAssistResponse> {
    return this.requestJson<FieldAssistResponse>(this.path("assist"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async fetchAgentTargets(
    entityType: string,
    id: string,
  ): Promise<AgentTarget[]> {
    const { agents } = await this.requestJson<{ agents: AgentTarget[] }>(
      this.path(
        `agents?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
      ),
    );
    return agents;
  }

  async requestAgentAnswer(input: {
    entityType: string;
    id: string;
    agent: string;
    instruction: string;
    selection: string;
  }): Promise<{ agentId: string; response: string }> {
    return this.requestJson<{ agentId: string; response: string }>(
      this.path("ask-agent"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
  }

  async fetchSyncStatus(): Promise<SyncStatus> {
    return this.requestJson<SyncStatus>(this.path("sync-status"));
  }

  async deleteEntity(
    entityType: string,
    id: string,
  ): Promise<{ deleted: boolean }> {
    return this.requestJson<{ deleted: boolean }>(
      this.path(
        `entities?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
      ),
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      },
    );
  }
}
