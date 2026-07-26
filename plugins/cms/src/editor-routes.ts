import { join } from "node:path";
import {
  requireSameOriginJson,
  requireSameOriginRequest,
  type AppendAuthAuditEventInput,
  type AuthPrincipal,
} from "@brains/auth-service";
import type { ActorRef } from "@brains/contracts";
import type {
  BaseEntity,
  CmsWorkspaceActor,
  ContentVisibility,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  A2A_CHANNELS,
  canWriteVisibility,
  contentVisibilitySchema,
  DIRECTORY_SYNC_CHANNELS,
  generateMarkdownWithFrontmatter,
  getPublishBoundaryState,
  parseMarkdownWithFrontmatter,
  jsonResponse as jsonResponseBase,
  permissionToVisibilityScope,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  entityTypeLabels,
  isRawEntityType,
  zodFieldToCmsWidget,
  type CmsEntityDisplayMap,
} from "./config";
import { deriveConsoleSurfaces } from "@brains/console-theme";
import { renderEditorShellHtml } from "./editor-shell";
import { normalizeCmsBasePath } from "./cms-paths";
import type { CmsWorkspaceRegistry } from "./workspace-registry";
import { getErrorMessage } from "@brains/utils/error";

// Named cms-app.js (not app.js): in the bundled @rizom/brain this resolves
// to the shared dist/ui directory, where app.js is web-chat's bundle.
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "cms-app.js");

const updateEntityPayloadSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().optional(),
  /** Content hash the edit was based on; stale writes are rejected. */
  baseContentHash: z.string().optional(),
});

const createEntityPayloadSchema = z.object({
  entityType: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().optional(),
});

const deleteEntityPayloadSchema = z.object({
  confirmed: z.literal(true),
});

const workspaceActionPayloadSchema = z.object({
  id: z.string().trim().min(1),
  action: z.unknown(),
});

const assistContextShape = {
  entityType: z.string(),
  id: z.string(),
};

const assistPayloadSchema = z.union([
  z.object({
    ...assistContextShape,
    variant: z.literal("rewrite").optional(),
    instruction: z.string().trim().min(1),
    selection: z.string().min(1).max(8_000),
  }),
  z.object({
    ...assistContextShape,
    variant: z.literal("summarise"),
    targetField: z.string().trim().min(1),
  }),
  z.object({
    ...assistContextShape,
    variant: z.literal("tag-suggest"),
    targetField: z.string().trim().min(1),
  }),
]);

const assistResponseSchema = z.object({
  suggestion: z.string(),
});

const tagAssistResponseSchema = z.object({
  suggestions: z.array(z.string().trim().min(1)).max(12),
});

const askAgentPayloadSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  selection: z.string().min(1).max(8_000),
  instruction: z.string().trim().min(1).max(2_000),
  agent: z.string().trim().min(1).max(253),
});

const a2aCallResultSchema = z.looseObject({
  response: z.string(),
});

const a2aAgentListSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
    }),
  ),
});

const UPLOAD_FORM_FIELD = "file";
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** What directory-sync answers sync:status:request with (extra keys ignored). */
const syncStatusMessageSchema = z.object({
  watchEnabled: z.boolean(),
  lastSync: z.string().nullable(),
  git: z
    .object({
      branch: z.string(),
      hasChanges: z.boolean(),
      ahead: z.number(),
      behind: z.number(),
      lastCommit: z.string().nullable(),
      remote: z.string().nullable(),
    })
    .nullable(),
});

export interface CmsRequestAccess {
  principal: AuthPrincipal;
  actor: Extract<ActorRef, { kind: "user" }>;
  permissionLevel: "trusted" | "admin";
  visibilityScope: Extract<ContentVisibility, "shared" | "restricted">;
  isAnchor: boolean;
}

export interface CmsTypeCapabilities {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExtract: boolean;
  canPublish: boolean;
  canAssist: boolean;
}

export interface EditorRouteOptions {
  /** Base route the editor is served from, e.g. "/cms". */
  routePath: string;
  getContext: () => ServicePluginContext;
  resolveAuthPrincipal: (
    request: Request,
  ) => Promise<AuthPrincipal | undefined>;
  /** Atomic rollout gate. Production remains Admin-only through Phase 4. */
  minimumPermissionLevel: "trusted" | "admin";
  getEntityDisplay: () => CmsEntityDisplayMap | undefined;
  workspaceRegistry: CmsWorkspaceRegistry;
  recordAuditEvent?:
    ((event: AppendAuthAuditEventInput) => Promise<void>) | undefined;
}

type CmsRequestAccessResolution =
  | { state: "allowed"; access: CmsRequestAccess }
  | { state: "unauthenticated" }
  | { state: "forbidden" };

/**
 * Routes for the first-party CMS editor: the React shell, its bundled
 * asset, and the entity read/write API. Every route except the asset is
 * gated on an authenticated session; writes go through the entity service so
 * the entity DB stays the single authoritative writer.
 */
export function createEditorRoutes(
  options: EditorRouteOptions,
): WebRouteDefinition[] {
  const {
    routePath,
    getContext,
    resolveAuthPrincipal,
    minimumPermissionLevel,
    getEntityDisplay,
    workspaceRegistry,
  } = options;
  const normalizedBase = normalizeCmsBasePath(routePath);
  const shellPath = normalizedBase || "/";
  const assetPath = `${normalizedBase}/assets/app.js`;
  const apiPath = (suffix: string): string => `${normalizedBase}/api/${suffix}`;

  const resolveRequestAccess = async (
    request: Request,
  ): Promise<CmsRequestAccessResolution> => {
    const principal = await resolveAuthPrincipal(request);
    if (principal?.status !== "active") {
      return { state: "unauthenticated" };
    }
    if (principal.permissionLevel === "public") {
      return { state: "forbidden" };
    }
    if (
      minimumPermissionLevel === "admin" &&
      principal.permissionLevel !== "admin"
    ) {
      return { state: "forbidden" };
    }

    const visibilityScope = permissionToVisibilityScope(
      principal.permissionLevel,
    );
    if (visibilityScope === "public") {
      return { state: "forbidden" };
    }
    return {
      state: "allowed",
      access: {
        principal,
        actor: {
          kind: "user",
          userId: principal.userId,
          ...(principal.canonicalId
            ? { canonicalId: principal.canonicalId }
            : {}),
        },
        permissionLevel: principal.permissionLevel,
        visibilityScope,
        isAnchor: principal.isAnchor,
      },
    };
  };

  const requireAccess = async (
    request: Request,
  ): Promise<CmsRequestAccess | Response> => {
    const resolution = await resolveRequestAccess(request);
    if (resolution.state === "unauthenticated") {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    if (resolution.state === "forbidden") {
      return jsonResponse({ error: "CMS access forbidden" }, 403);
    }
    return resolution.access;
  };

  const serveShell = async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url);
    const returnTo = `${requestUrl.pathname}${requestUrl.search}`;
    const resolution = await resolveRequestAccess(request);
    if (resolution.state === "unauthenticated") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/login?return_to=${encodeURIComponent(returnTo)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (resolution.state === "forbidden") {
      return new Response("CMS access forbidden", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new Response(
      renderEditorShellHtml({
        assetPath,
        basePath: shellPath,
        surfaces: deriveConsoleSurfaces(getContext().webRoutes.getRoutes(), {
          activeId: "cms",
          permissionLevel: resolution.access.permissionLevel,
          self: { id: "cms", href: shellPath },
        }),
        sessionHref: `/logout?return_to=${encodeURIComponent(returnTo)}`,
      }),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  };

  return [
    {
      path: shellPath,
      method: "GET",
      public: true,
      handler: serveShell,
    },
    {
      path: `${normalizedBase}/entities`,
      match: "prefix",
      method: "GET",
      public: true,
      handler: serveShell,
    },
    {
      path: `${normalizedBase}/workspaces`,
      match: "prefix",
      method: "GET",
      public: true,
      handler: serveShell,
    },
    {
      path: assetPath,
      method: "GET",
      public: true,
      handler: async (): Promise<Response> => {
        const file = Bun.file(uiAssetFile);
        if (!(await file.exists())) {
          return new Response("CMS editor UI asset not built", {
            status: 404,
          });
        }
        return new Response(file, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
    {
      path: apiPath("types"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        return handleListTypes(
          getContext(),
          getEntityDisplay(),
          workspaceRegistry,
          access,
        );
      },
    },
    {
      path: apiPath("workspace"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        return handleGetWorkspace(workspaceRegistry, request, access);
      },
    },
    {
      path: apiPath("workspace"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const requestDenied = requireSameOriginJson(request);
        if (requestDenied) return requestDenied;
        return handleWorkspaceAction(workspaceRegistry, request, access);
      },
    },
    {
      path: apiPath("schema"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        return handleGetSchema(getContext(), request, access);
      },
    },
    {
      path: apiPath("entities"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        return handleGetEntities(getContext(), request, access);
      },
    },
    {
      path: apiPath("entities"),
      method: "PUT",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const requestDenied = requireSameOriginJson(request);
        if (requestDenied) return requestDenied;
        return handleUpdateEntity(
          getContext(),
          request,
          access,
          options.recordAuditEvent,
        );
      },
    },
    {
      path: apiPath("entities"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const requestDenied = requireSameOriginJson(request);
        if (requestDenied) return requestDenied;
        return handleCreateEntity(
          getContext(),
          request,
          access,
          options.recordAuditEvent,
        );
      },
    },
    {
      path: apiPath("entities"),
      method: "DELETE",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const requestDenied = requireSameOriginJson(request);
        if (requestDenied) return requestDenied;
        return handleDeleteEntity(
          getContext(),
          request,
          access,
          options.recordAuditEvent,
        );
      },
    },
    {
      path: apiPath("upload"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const requestDenied = requireSameOriginRequest(request);
        if (requestDenied) return requestDenied;
        return handleUpload(
          getContext(),
          request,
          apiPath("upload"),
          access,
          options.recordAuditEvent,
        );
      },
    },
    {
      path: apiPath("assist"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const requestDenied = requireSameOriginJson(request);
        if (requestDenied) return requestDenied;
        return handleAssist(getContext(), request, access);
      },
    },
    {
      path: apiPath("agents"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        return handleListAgents(getContext(), request, access);
      },
    },
    {
      path: apiPath("ask-agent"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const requestDenied = requireSameOriginJson(request);
        if (requestDenied) return requestDenied;
        return handleAskAgent(getContext(), request, access);
      },
    },
    {
      path: apiPath("sync-status"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireAccess(request);
        if (access instanceof Response) return access;
        const denied = requireAdminCapability(access);
        if (denied) return denied;
        return handleSyncStatus(getContext());
      },
    },
  ];
}

function toCmsWorkspaceActor(access: CmsRequestAccess): CmsWorkspaceActor {
  return {
    interfaceType: "cms",
    userId: access.principal.userId,
    actor: access.actor,
    userPermissionLevel: access.permissionLevel,
    visibilityScope: access.visibilityScope,
    isAnchor: access.isAnchor,
  };
}

type CmsMutationOperation = "create" | "update" | "delete" | "upload";
type CmsMutationOutcome = "allowed" | "denied";

async function recordCmsMutationAudit(
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
  access: CmsRequestAccess,
  operation: CmsMutationOperation,
  outcome: CmsMutationOutcome,
  entityType: string,
  targetId?: string,
  reason?: string,
): Promise<void> {
  if (!recordAuditEvent) return;
  await recordAuditEvent({
    actorUserId: access.principal.userId,
    action: `cms.entity.${operation}.${outcome}`,
    targetType: "entity",
    ...(targetId ? { targetId } : {}),
    metadata: {
      entityType,
      interfaceType: "cms",
      outcome,
      ...(reason ? { reason } : {}),
    },
  });
}

function cmsMutationOptions(access: CmsRequestAccess): {
  eventContext: {
    actor: CmsRequestAccess["actor"];
    interfaceType: "cms";
  };
} {
  return {
    eventContext: {
      actor: access.actor,
      interfaceType: "cms",
    },
  };
}

function requireAdminCapability(access: CmsRequestAccess): Response | null {
  return access.permissionLevel === "admin"
    ? null
    : jsonResponse({ error: "Admin CMS capability required" }, 403);
}

function requireEntityAction(
  context: ServicePluginContext,
  entityType: string,
  action: "create" | "update" | "delete" | "extract" | "publish",
  access: CmsRequestAccess,
): Response | null {
  try {
    context.permissions.assertEntityActionAllowed(entityType, action, {
      userPermissionLevel: access.permissionLevel,
    });
    return null;
  } catch (error) {
    return jsonResponse(
      {
        error: getErrorMessage(error, `CMS ${action} permission denied`),
      },
      403,
    );
  }
}

function canPerformEntityAction(
  context: ServicePluginContext,
  entityType: string,
  action: "create" | "update" | "delete" | "extract" | "publish",
  access: CmsRequestAccess,
): boolean {
  try {
    context.permissions.assertEntityActionAllowed(entityType, action, {
      userPermissionLevel: access.permissionLevel,
    });
    return true;
  } catch {
    return false;
  }
}

function deriveTypeCapabilities(
  context: ServicePluginContext,
  entityType: string,
  visibleCount: number,
  access: CmsRequestAccess,
): CmsTypeCapabilities | undefined {
  const canCreate = canPerformEntityAction(
    context,
    entityType,
    "create",
    access,
  );
  const canUpdate = canPerformEntityAction(
    context,
    entityType,
    "update",
    access,
  );
  const canDelete = canPerformEntityAction(
    context,
    entityType,
    "delete",
    access,
  );
  const canExtract = canPerformEntityAction(
    context,
    entityType,
    "extract",
    access,
  );
  const canPublish = canPerformEntityAction(
    context,
    entityType,
    "publish",
    access,
  );
  const canRead =
    visibleCount > 0 ||
    canCreate ||
    canUpdate ||
    canDelete ||
    canExtract ||
    canPublish;
  if (!canRead) return undefined;

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    canExtract,
    canPublish,
    canAssist: canUpdate,
  };
}

async function getTypeCapabilities(
  context: ServicePluginContext,
  entityType: string,
  access: CmsRequestAccess,
): Promise<CmsTypeCapabilities | undefined> {
  if (!context.entities.getEffectiveFrontmatterSchema(entityType)) {
    return undefined;
  }
  const visibleCount = await context.entityService.countEntities({
    entityType,
    options: { filter: { visibilityScope: access.visibilityScope } },
  });
  return deriveTypeCapabilities(context, entityType, visibleCount, access);
}

/**
 * Save-pipeline status for the instrument strip: where the last write is
 * in the entity db → file export → git commit chain. Directory-sync answers
 * over the message bus; when it (or git) is absent the payload degrades to
 * nulls and the strip simply doesn't render those stations.
 */
async function handleSyncStatus(
  context: ServicePluginContext,
): Promise<Response> {
  const unavailable = { directorySync: null, git: null };
  const response = await context.messaging.send({
    type: DIRECTORY_SYNC_CHANNELS.statusRequest,
    payload: {},
  });
  if (!("success" in response) || !response.success) {
    return jsonResponse(unavailable);
  }

  const parsed = syncStatusMessageSchema.safeParse(response.data);
  if (!parsed.success) {
    return jsonResponse(unavailable);
  }

  return jsonResponse({
    directorySync: {
      lastSync: parsed.data.lastSync,
      watching: parsed.data.watchEnabled,
    },
    git: parsed.data.git,
  });
}

async function handleListTypes(
  context: ServicePluginContext,
  entityDisplay: CmsEntityDisplayMap | undefined,
  workspaceRegistry: CmsWorkspaceRegistry,
  access: CmsRequestAccess,
): Promise<Response> {
  const counts = new Map(
    (await context.entityService.getEntityCounts(access.visibilityScope)).map(
      (entry) => [entry.entityType, entry.count],
    ),
  );
  const types = context.entityService.getEntityTypes().flatMap((entityType) => {
    const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
    if (!schema) return [];
    const count = counts.get(entityType) ?? 0;
    const capabilities = deriveTypeCapabilities(
      context,
      entityType,
      count,
      access,
    );
    if (!capabilities) return [];
    const adapter = context.entities.getAdapter(entityType);
    return [
      {
        entityType,
        label: entityTypeLabels(entityType, entityDisplay?.[entityType])
          .pluralLabel,
        isSingleton: adapter?.isSingleton === true,
        hasBody: adapter?.hasBody !== false,
        count,
        capabilities,
      },
    ];
  });

  return jsonResponse({
    types,
    workspaces: await workspaceRegistry.listDescriptors(
      toCmsWorkspaceActor(access),
    ),
  });
}

async function handleGetWorkspace(
  workspaceRegistry: CmsWorkspaceRegistry,
  request: Request,
  access: CmsRequestAccess,
): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return jsonResponse({ error: "id query parameter is required" }, 400);
  }

  const workspace = workspaceRegistry.get(id);
  if (!workspace) {
    return jsonResponse({ error: `Unknown CMS workspace: ${id}` }, 404);
  }

  const actor = toCmsWorkspaceActor(access);
  if (!(await workspace.accessHandler(actor))) {
    return jsonResponse({ error: `Unknown CMS workspace: ${id}` }, 404);
  }

  try {
    return jsonResponse({
      workspace: {
        id: workspace.id,
        rendererName: workspace.rendererName,
        data: await workspace.dataProvider(actor),
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: getErrorMessage(error, "CMS workspace data provider failed"),
      },
      502,
    );
  }
}

async function handleWorkspaceAction(
  workspaceRegistry: CmsWorkspaceRegistry,
  request: Request,
  access: CmsRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof workspaceActionPayloadSchema>;
  try {
    payload = workspaceActionPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "Invalid workspace action payload" }, 400);
  }

  const workspace = workspaceRegistry.get(payload.id);
  if (!workspace) {
    return jsonResponse({ error: `Unknown CMS workspace: ${payload.id}` }, 404);
  }
  const actor = toCmsWorkspaceActor(access);
  if (!(await workspace.accessHandler(actor))) {
    return jsonResponse({ error: `Unknown CMS workspace: ${payload.id}` }, 404);
  }
  if (!workspace.actionHandler) {
    return jsonResponse(
      { error: `CMS workspace ${payload.id} does not provide actions` },
      405,
    );
  }

  try {
    return jsonResponse({
      result: await workspace.actionHandler(payload.action, actor),
    });
  } catch (error) {
    return jsonResponse(
      {
        error: getErrorMessage(error, "CMS workspace action failed"),
      },
      400,
    );
  }
}

async function handleGetSchema(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
): Promise<Response> {
  const entityType = new URL(request.url).searchParams.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }

  const capabilities = await getTypeCapabilities(context, entityType, access);
  const schema = capabilities
    ? context.entities.getEffectiveFrontmatterSchema(entityType)
    : undefined;
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const adapter = context.entities.getAdapter(entityType);
  const raw = isRawEntityType(entityType);
  // Raw types edit the whole document as body; their frontmatter schema is
  // system bookkeeping and must not surface as form fields.
  const fields = raw
    ? []
    : Object.keys(schema.shape).map((name) =>
        zodFieldToCmsWidget(name, schema.shape[name]),
      );

  return jsonResponse({
    entityType,
    format: raw ? "raw" : "frontmatter",
    isSingleton: adapter?.isSingleton === true,
    hasBody: raw || adapter?.hasBody !== false,
    fields,
  });
}

async function handleGetEntities(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }
  if (!(await getTypeCapabilities(context, entityType, access))) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const id = params.get("id");
  if (id) {
    const entity = await context.entityService.getEntity({
      entityType,
      id,
      visibilityScope: access.visibilityScope,
    });
    if (!entity) {
      return jsonResponse({ error: `Entity not found: ${id}` }, 404);
    }
    const { frontmatter, body } = splitEntityContent(
      entityType,
      entity.content,
    );
    return jsonResponse({
      entity: {
        id: entity.id,
        entityType: entity.entityType,
        frontmatter,
        body,
        contentHash: entity.contentHash,
        created: entity.created,
        updated: entity.updated,
      },
    });
  }

  const entities = await context.entityService.listEntities({
    entityType,
    options: { filter: { visibilityScope: access.visibilityScope } },
  });
  return jsonResponse({
    entities: entities.map((entity) => ({
      id: entity.id,
      entityType: entity.entityType,
      frontmatter: splitEntityContent(entityType, entity.content).frontmatter,
      updated: entity.updated,
    })),
  });
}

async function handleUpdateEntity(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  let payload: z.infer<typeof updateEntityPayloadSchema>;
  try {
    payload = updateEntityPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "Invalid update payload" }, 400);
  }

  const { entityType, id } = payload;
  const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const existing = await context.entityService.getEntity({
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!existing) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }

  const bodyError = rejectBodyForBodylessType(
    context,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;

  const raw = isRawEntityType(entityType);
  if (raw && Object.keys(payload.frontmatter).length > 0) {
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  }

  const visibility = resolveCmsVisibility(
    payload.frontmatter,
    existing.visibility,
  );
  if (!visibility.success) return visibility.response;

  // Validate before anything is written — field-level errors go back to
  // the form, the entity service is never called with invalid frontmatter.
  const frontmatter = raw
    ? z.object({}).safeParse({})
    : schema.safeParse(payload.frontmatter);
  if (!frontmatter.success) {
    return jsonResponse(
      { error: "Invalid frontmatter", issues: frontmatter.error.issues },
      400,
    );
  }

  const body =
    payload.body ?? splitEntityContent(entityType, existing.content).body;
  const content = raw
    ? body
    : generateMarkdownWithFrontmatter(
        body,
        withCmsVisibility(frontmatter.data, visibility.visibility),
      );

  // Re-derive adapter fields (metadata, visibility, etc.) from the finalized
  // content before applying policy. Incoming form data is never the authority.
  const parsed = context.entities.getAdapter(entityType)?.fromMarkdown(content);
  const entity: BaseEntity = {
    ...existing,
    ...parsed,
    id: existing.id,
    entityType: existing.entityType,
    content,
    metadata: stripCmsPolicyMetadata(parsed?.metadata ?? existing.metadata),
    visibility: visibility.visibility,
  };

  const publishBoundary = getPublishBoundaryState(
    entityType,
    existing.metadata["status"],
    entity.metadata["status"],
    context.entityService,
  );
  const requiredAction =
    publishBoundary === "non-publish" ? "update" : "publish";
  const actionDenied = requireEntityAction(
    context,
    entityType,
    requiredAction,
    access,
  );
  if (actionDenied) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "update",
      "denied",
      entityType,
      id,
      "entity-action-policy",
    );
    return actionDenied;
  }

  if (!canWriteVisibility(access.permissionLevel, entity.visibility)) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "update",
      "denied",
      entityType,
      id,
      "visibility-policy",
    );
    return jsonResponse(
      {
        error: `Cannot set entity visibility to "${entity.visibility}" at ${access.permissionLevel} permission.`,
      },
      403,
    );
  }

  // Stale-write guard: another writer (an agent, or a git import through
  // directory-sync) may have touched this entity since it was opened.
  if (
    payload.baseContentHash !== undefined &&
    payload.baseContentHash !== existing.contentHash
  ) {
    return jsonResponse(
      {
        error:
          "This entry changed since it was opened — likely updated by " +
          "another writer (an agent, or a git import via directory-sync). " +
          "Reload to review before saving again.",
        currentContentHash: existing.contentHash,
      },
      409,
    );
  }

  const persistenceDenied = requireEntityAction(
    context,
    entityType,
    requiredAction,
    access,
  );
  if (persistenceDenied) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "update",
      "denied",
      entityType,
      id,
      "entity-action-policy",
    );
    return persistenceDenied;
  }

  const result = await context.entityService.updateEntity({
    entity,
    options: cmsMutationOptions(access),
  });
  await recordCmsMutationAudit(
    recordAuditEvent,
    access,
    "update",
    "allowed",
    entityType,
    id,
  );
  // skipped: the content was already stored byte-identically — no event is
  // emitted, so nothing flows down the export/commit pipeline.
  return jsonResponse({
    entityId: result.entityId,
    jobId: result.jobId,
    skipped: result.skipped,
  });
}

async function handleCreateEntity(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  let payload: z.infer<typeof createEntityPayloadSchema>;
  try {
    payload = createEntityPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "Invalid create payload" }, 400);
  }

  const { entityType } = payload;
  const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const actionDenied = requireEntityAction(
    context,
    entityType,
    "create",
    access,
  );
  if (actionDenied) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "create",
      "denied",
      entityType,
      undefined,
      "entity-action-policy",
    );
    return actionDenied;
  }

  const bodyError = rejectBodyForBodylessType(
    context,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;

  const raw = isRawEntityType(entityType);
  if (raw && Object.keys(payload.frontmatter).length > 0) {
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  }

  const visibility = resolveCmsVisibility(payload.frontmatter, "public");
  if (!visibility.success) return visibility.response;

  const frontmatter = raw
    ? z.object({}).safeParse({})
    : schema.safeParse(payload.frontmatter);
  if (!frontmatter.success) {
    return jsonResponse(
      { error: "Invalid frontmatter", issues: frontmatter.error.issues },
      400,
    );
  }

  const content = raw
    ? (payload.body ?? "")
    : generateMarkdownWithFrontmatter(
        payload.body ?? "",
        withCmsVisibility(frontmatter.data, visibility.visibility),
      );
  const parsed = context.entities.getAdapter(entityType)?.fromMarkdown(content);
  const entity = {
    ...parsed,
    entityType,
    content,
    metadata: stripCmsPolicyMetadata(parsed?.metadata ?? {}),
    visibility: visibility.visibility,
  };
  if (!canWriteVisibility(access.permissionLevel, entity.visibility)) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "create",
      "denied",
      entityType,
      undefined,
      "visibility-policy",
    );
    return jsonResponse(
      {
        error: `Cannot set entity visibility to "${entity.visibility}" at ${access.permissionLevel} permission.`,
      },
      403,
    );
  }

  // Recheck at the persistence boundary after adapter-derived policy fields.
  const persistenceDenied = requireEntityAction(
    context,
    entityType,
    "create",
    access,
  );
  if (persistenceDenied) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "create",
      "denied",
      entityType,
      undefined,
      "entity-action-policy",
    );
    return persistenceDenied;
  }

  // No id: the entity service derives one, keeping id policy server-side.
  const result = await context.entityService.createEntity({
    entity,
    options: cmsMutationOptions(access),
  });
  await recordCmsMutationAudit(
    recordAuditEvent,
    access,
    "create",
    "allowed",
    entityType,
    result.entityId,
  );

  return jsonResponse({ entityId: result.entityId, jobId: result.jobId }, 201);
}

async function handleDeleteEntity(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  try {
    deleteEntityPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Explicit delete confirmation required" },
      400,
    );
  }

  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  const id = params.get("id");
  if (!entityType || !id) {
    return jsonResponse(
      { error: "type and id query parameters are required" },
      400,
    );
  }

  const existing = await context.entityService.getEntity({
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!existing) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }

  const actionDenied = requireEntityAction(
    context,
    entityType,
    "delete",
    access,
  );
  if (actionDenied) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "delete",
      "denied",
      entityType,
      id,
      "entity-action-policy",
    );
    return actionDenied;
  }

  const deleted = await context.entityService.deleteEntity({
    entityType,
    id,
    options: cmsMutationOptions(access),
  });
  if (deleted) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "delete",
      "allowed",
      entityType,
      id,
    );
  }
  return jsonResponse({ deleted });
}

interface CmsAssistEntityContext {
  entity: BaseEntity;
  frontmatter: Record<string, unknown>;
  body: string;
}

async function resolveCmsAssistEntity(
  context: ServicePluginContext,
  entityType: string,
  id: string,
  access: CmsRequestAccess,
): Promise<CmsAssistEntityContext | Response> {
  if (!context.entities.getEffectiveFrontmatterSchema(entityType)) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }
  const entity = await context.entityService.getEntity({
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!entity) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }
  const denied = requireEntityAction(context, entityType, "update", access);
  if (denied) return denied;
  const content = splitEntityContent(entityType, entity.content);
  return { entity, ...content };
}

function requireStoredSelection(
  context: CmsAssistEntityContext,
  selection: string,
): Response | null {
  return context.body.includes(selection)
    ? null
    : jsonResponse(
        { error: "Selection no longer matches the stored entity" },
        409,
      );
}

async function handleAssist(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof assistPayloadSchema>;
  try {
    payload = assistPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Invalid assist payload or selection length" },
      400,
    );
  }

  const entityContext = await resolveCmsAssistEntity(
    context,
    payload.entityType,
    payload.id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;

  const frontmatterSchema = context.entities.getEffectiveFrontmatterSchema(
    payload.entityType,
  );
  if (!frontmatterSchema) {
    return jsonResponse(
      { error: `Unknown entity type: ${payload.entityType}` },
      404,
    );
  }

  if (payload.variant === "summarise" || payload.variant === "tag-suggest") {
    const fieldSchema = frontmatterSchema.shape[payload.targetField];
    if (!fieldSchema) {
      return jsonResponse(
        { error: `Unknown frontmatter field: ${payload.targetField}` },
        400,
      );
    }
    const descriptor = zodFieldToCmsWidget(payload.targetField, fieldSchema);
    const compatible =
      payload.variant === "summarise"
        ? descriptor.widget === "string" || descriptor.widget === "text"
        : descriptor.widget === "list" && descriptor.field?.widget === "string";
    if (!compatible) {
      return jsonResponse(
        {
          error: `Field ${payload.targetField} is incompatible with ${payload.variant}`,
        },
        400,
      );
    }

    const contextLines = [
      "You are editing CMS frontmatter from an existing markdown body.",
      `Entity type: ${payload.entityType}`,
      `Target field: ${payload.targetField}`,
      `Existing frontmatter JSON: ${JSON.stringify(entityContext.frontmatter)}`,
      "",
      "Full markdown body:",
      entityContext.body,
    ];

    if (payload.variant === "summarise") {
      const { object } = await context.ai.generateObject(
        [
          "Summarise the body for the target frontmatter field.",
          "Return only the field value in the suggestion field.",
          ...contextLines,
        ].join("\n"),
        assistResponseSchema,
      );
      return jsonResponse({
        variant: payload.variant,
        targetField: payload.targetField,
        suggestion: object.suggestion,
      });
    }

    const { object } = await context.ai.generateObject(
      [
        "Suggest tags for the target frontmatter field.",
        "Return concise tag strings in the suggestions field without duplicates.",
        ...contextLines,
      ].join("\n"),
      tagAssistResponseSchema,
    );
    return jsonResponse({
      variant: payload.variant,
      targetField: payload.targetField,
      suggestions: [...new Set(object.suggestions)],
    });
  }

  const selectionError = requireStoredSelection(
    entityContext,
    payload.selection,
  );
  if (selectionError) return selectionError;
  const prompt = [
    "You are editing markdown for the CMS.",
    "Rewrite only the selected text according to the instruction.",
    "Return only replacement markdown in the suggestion field.",
    "Do not include commentary, code fences, or unchanged surrounding body text.",
    "",
    `Entity type: ${payload.entityType}`,
    `Frontmatter JSON: ${JSON.stringify(entityContext.frontmatter)}`,
    `Instruction: ${payload.instruction}`,
    "",
    "Selected markdown:",
    payload.selection,
    "",
    "Full body for context:",
    entityContext.body,
  ].join("\n");

  const { object } = await context.ai.generateObject(
    prompt,
    assistResponseSchema,
  );
  return jsonResponse({ suggestion: object.suggestion });
}

async function handleListAgents(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  const id = params.get("id");
  if (!entityType || !id) {
    return jsonResponse(
      { error: "type and id query parameters are required" },
      400,
    );
  }
  const entityContext = await resolveCmsAssistEntity(
    context,
    entityType,
    id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;

  const response = await context.messaging.send({
    type: A2A_CHANNELS.callAgents,
    payload: {
      entityType,
      entityId: entityContext.entity.id,
      actor: access.actor,
      interfaceType: "cms",
    },
  });
  if (!("success" in response) || !response.success) {
    // No a2a interface (or no directory) means the client keeps the existing
    // model-only assist bar.
    return jsonResponse({ agents: [] });
  }

  const parsed = a2aAgentListSchema.safeParse(response.data);
  return jsonResponse(parsed.success ? parsed.data : { agents: [] });
}

async function handleAskAgent(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof askAgentPayloadSchema>;
  try {
    payload = askAgentPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Invalid agent ask payload or selection length" },
      400,
    );
  }

  const entityContext = await resolveCmsAssistEntity(
    context,
    payload.entityType,
    payload.id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;
  const selectionError = requireStoredSelection(
    entityContext,
    payload.selection,
  );
  if (selectionError) return selectionError;

  const result = await context.messaging.send({
    type: A2A_CHANNELS.callRequest,
    payload: {
      agent: payload.agent,
      instruction: payload.instruction,
      selection: payload.selection,
      entityType: payload.entityType,
      entityId: entityContext.entity.id,
      actor: access.actor,
      interfaceType: "cms",
    },
  });
  if (!("success" in result) || !result.success) {
    const error =
      "error" in result && typeof result.error === "string"
        ? result.error
        : "Agent call failed";
    const unavailable = error.startsWith("No handler found");
    return jsonResponse(
      { error: unavailable ? "Agent asking is unavailable" : error },
      unavailable ? 503 : 400,
    );
  }

  if (result.data === undefined) {
    return jsonResponse({ error: "Agent asking is unavailable" }, 503);
  }
  const parsed = a2aCallResultSchema.safeParse(result.data);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid response from agent" }, 502);
  }

  return jsonResponse({
    agentId: payload.agent,
    response: parsed.data.response,
  });
}

/**
 * Store the uploaded bytes in the shared runtime upload store, then promote
 * them through the upload-save handler the owning entity plugin registered
 * (images: the `image` plugin's promotion pipeline). The editor never
 * writes media entities itself — the pipeline stays the single owner.
 */
async function handleUpload(
  context: ServicePluginContext,
  request: Request,
  routePath: string,
  access: CmsRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: "Upload too large" }, 400);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart upload" }, 400);
  }

  const file = form.get(UPLOAD_FORM_FIELD);
  if (!(file instanceof File)) {
    return jsonResponse({ error: "Missing upload file" }, 400);
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: "Upload too large" }, 400);
  }

  const registration = context.entities.getUploadSaveHandler(file.type);
  if (!registration) {
    return jsonResponse(
      { error: `No handler accepts uploads of type ${file.type}` },
      415,
    );
  }
  const actionError = requireEntityAction(
    context,
    registration.entityType,
    "create",
    access,
  );
  if (actionError) {
    await recordCmsMutationAudit(
      recordAuditEvent,
      access,
      "upload",
      "denied",
      registration.entityType,
      undefined,
      "entity-action-policy",
    );
    return actionError;
  }

  const store = context.uploads.scoped({
    namespace: "upload",
    refKind: "upload",
    routePath,
  });
  const record = await store.save({
    filename: file.name,
    mediaType: file.type,
    content: Buffer.from(await file.arrayBuffer()),
  });

  let result: Awaited<ReturnType<typeof registration.handler>>;
  try {
    result = await registration.handler(
      { upload: { kind: "upload", id: record.id } },
      {
        interfaceType: "cms",
        actor: access.actor,
      },
    );
  } catch {
    await store.remove(record.id);
    return jsonResponse({ error: "Upload promotion failed" }, 502);
  }

  if (!result.success) {
    await store.remove(record.id);
    return jsonResponse({ error: result.error }, 502);
  }
  await recordCmsMutationAudit(
    recordAuditEvent,
    access,
    "upload",
    "allowed",
    registration.entityType,
    result.data.entityId,
  );
  return jsonResponse(
    { entityId: result.data.entityId, jobId: result.data.jobId },
    201,
  );
}

function stripCmsPolicyMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { visibility: _visibility, ...rest } = metadata;
  return rest;
}

function resolveCmsVisibility(
  frontmatter: Record<string, unknown>,
  fallback: ContentVisibility,
):
  | { success: true; visibility: ContentVisibility }
  | { success: false; response: Response } {
  if (!Object.hasOwn(frontmatter, "visibility")) {
    return { success: true, visibility: fallback };
  }
  const parsed = contentVisibilitySchema.safeParse(frontmatter["visibility"]);
  return parsed.success
    ? { success: true, visibility: parsed.data }
    : {
        success: false,
        response: jsonResponse({ error: "Invalid content visibility" }, 400),
      };
}

function withCmsVisibility(
  frontmatter: Record<string, unknown>,
  visibility: ContentVisibility,
): Record<string, unknown> {
  const { visibility: _untrustedVisibility, ...fields } = frontmatter;
  return visibility === "public" ? fields : { ...fields, visibility };
}

function rejectBodyForBodylessType(
  context: ServicePluginContext,
  entityType: string,
  body: string | undefined,
): Response | null {
  if (body === undefined) return null;
  const adapter = context.entities.getAdapter(entityType);
  if (adapter?.hasBody === false) {
    return jsonResponse(
      { error: `Entity type ${entityType} does not have a body` },
      400,
    );
  }
  return null;
}

function splitEntityContent(
  entityType: string,
  content: string,
): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  // Raw types never carry frontmatter — a leading `---` is a horizontal
  // rule and must not be parsed as a YAML delimiter.
  if (isRawEntityType(entityType)) {
    return { frontmatter: {}, body: content };
  }
  try {
    const parsed = parseMarkdownWithFrontmatter(
      content,
      z.record(z.string(), z.unknown()),
    );
    return { frontmatter: parsed.metadata, body: parsed.content };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return jsonResponseBase(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
