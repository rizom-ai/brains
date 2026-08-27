import { join } from "node:path";
import {
  requireSameOriginJson,
  requireSameOriginRequest,
} from "@brains/auth-service";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import {
  canWriteVisibility,
  deriveConsoleSurfaces,
  permissionToVisibilityScope,
} from "@brains/plugins";
import { DIRECTORY_SYNC_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  entityTypeLabels,
  isRawEntityType,
  zodFieldToCmsWidget,
  type CmsEntityDisplayMap,
} from "./config";
import { renderEditorShellHtml } from "./editor-shell";
import { normalizeCmsBasePath } from "./cms-paths";
import type { CmsWorkspaceRegistry } from "./workspace-registry";
import { getErrorMessage } from "@brains/utils/error";
import { jsonResponse } from "./editor-response";
import {
  handleCreateEntity,
  handleDeleteEntity,
  handleGetEntities,
  handleUpdateEntity,
} from "./editor-entities";
import { handleUpload } from "./editor-upload";
import {
  handleAskAgent,
  handleAssist,
  handleListAgents,
} from "./editor-assist";
import {
  deriveTypeCapabilities,
  getTypeCapabilities,
  requireAdminCapability,
  toCmsWorkspaceActor,
} from "./editor-access";
import type {
  CmsRequestAccess,
  CmsRequestAccessResolution,
  EditorRouteOptions,
} from "./editor-contracts";

export type {
  CmsRequestAccess,
  CmsTypeCapabilities,
  EditorRouteOptions,
} from "./editor-contracts";

const CONTENT_VISIBILITIES = ["public", "shared", "restricted"] as const;

// Named cms-app.js (not app.js): in the bundled @rizom/brain this resolves
// to the shared dist/ui directory, where app.js is web-chat's bundle.
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "cms-app.js");

const workspaceActionPayloadSchema = z.object({
  id: z.string().trim().min(1),
  action: z.unknown(),
});

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
        principal: {
          displayName: resolution.access.principal.displayName,
          role: resolution.access.principal.role,
        },
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
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id");
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
        data: await workspace.dataProvider(
          actor,
          workspaceQueryFromSearchParams(searchParams),
          request.signal,
        ),
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

function workspaceQueryFromSearchParams(
  searchParams: URLSearchParams,
): Record<string, string> {
  const { id: _id, ...query } = Object.fromEntries(searchParams);
  return query;
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
      result: await workspace.actionHandler(
        payload.action,
        actor,
        request.signal,
      ),
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
  // Raw types edit the whole document as body; their domain frontmatter
  // bookkeeping must not surface. Visibility is system-owned and applies to
  // every entity type independently of its markdown representation.
  const domainFields = raw
    ? []
    : Object.keys(schema.shape).map((name) =>
        zodFieldToCmsWidget(name, schema.shape[name]),
      );
  const visibilityField = {
    name: "visibility",
    label: "Visibility",
    widget: "select",
    required: true,
    default: "public",
    options: CONTENT_VISIBILITIES.filter((visibility) =>
      canWriteVisibility(access.permissionLevel, visibility),
    ),
  };
  const fields = [...domainFields, visibilityField];

  return jsonResponse({
    entityType,
    format: raw ? "raw" : "frontmatter",
    isSingleton: adapter?.isSingleton === true,
    hasBody: raw || adapter?.hasBody !== false,
    fields,
  });
}
