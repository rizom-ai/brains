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
import { DEFAULT_CHAT_API_PATH } from "@brains/contracts/chat";
import { z } from "@brains/utils/zod";
import {
  entityTypeLabels,
  isRawEntityType,
  zodFieldToStudioWidget,
  type StudioEntityDisplayMap,
} from "./config";
import { renderEditorShellHtml } from "./editor-shell";
import { normalizeStudioBasePath } from "./studio-paths";
import { listBuiltInStudioWorkspaces } from "./account-workspace";
import {
  listBuiltInStudioChatWorkspaces,
  STUDIO_CHAT_ROUTE_PATH,
} from "./chat-workspace";
import type { StudioWorkspaceRegistry } from "./workspace-registry";
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
  requireTrustedCapability,
  toStudioWorkspaceActor,
} from "./editor-access";
import type {
  StudioRequestAccess,
  StudioRequestAccessResolution,
  EditorRouteOptions,
} from "./editor-contracts";

export type {
  StudioRequestAccess,
  StudioTypeCapabilities,
  EditorRouteOptions,
} from "./editor-contracts";

const CONTENT_VISIBILITIES = ["public", "shared", "restricted"] as const;

function resolveStudioChatApiPath(
  context: ServicePluginContext,
): string | undefined {
  if (!context.plugins.has("web-chat")) return undefined;
  const routes = context.webRoutes
    .getRoutes()
    .filter((route) => route.pluginId === "web-chat");
  const actionsRoute = routes.find(
    (route) =>
      route.fullPath.endsWith("/actions") &&
      (route.definition.method ?? "GET") === "POST" &&
      route.definition.match !== "prefix",
  );
  if (!actionsRoute) return DEFAULT_CHAT_API_PATH;
  const apiPath = actionsRoute.fullPath.slice(0, -"/actions".length);
  return routes.some(
    (route) =>
      route.fullPath === apiPath &&
      (route.definition.method ?? "GET") === "POST" &&
      route.definition.match !== "prefix",
  )
    ? apiPath
    : DEFAULT_CHAT_API_PATH;
}

// Studio and web-chat share dist/ui in the bundled @rizom/brain. Studio's
// generated manifest maps its public asset names to package-owned files.
const uiAssetDirectory = join(import.meta.dir, "..", "dist", "ui");
const uiAssetManifestFile = join(
  uiAssetDirectory,
  "studio-asset-manifest.json",
);
const studioAssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.record(z.string(), z.string()),
});

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

function isSafeStudioAssetPath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value
      .split("/")
      .every(
        (segment) => segment !== "" && segment !== "." && segment !== "..",
      ) &&
    /^(?:app\.(?:js|css)|studio-app\.(?:js|css)|studio-app\.js\.map|studio-chunks\/[a-zA-Z0-9_-]+\.(?:js|js\.map))$/.test(
      value,
    )
  );
}

async function serveStudioAsset(
  request: Request,
  assetPrefix: string,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(`${assetPrefix}/`)) {
    return new Response("Studio UI asset not found", { status: 404 });
  }

  let publicPath: string;
  try {
    publicPath = decodeURIComponent(pathname.slice(assetPrefix.length + 1));
  } catch {
    return new Response("Studio UI asset not found", { status: 404 });
  }
  if (!isSafeStudioAssetPath(publicPath)) {
    return new Response("Studio UI asset not found", { status: 404 });
  }

  let manifest: z.output<typeof studioAssetManifestSchema>;
  try {
    manifest = studioAssetManifestSchema.parse(
      await Bun.file(uiAssetManifestFile).json(),
    );
  } catch {
    return new Response("Studio editor UI assets not built", { status: 404 });
  }

  const relativeFile = manifest.assets[publicPath];
  if (!relativeFile || !isSafeStudioAssetPath(relativeFile)) {
    return new Response("Studio UI asset not found", { status: 404 });
  }
  const file = Bun.file(join(uiAssetDirectory, relativeFile));
  if (!(await file.exists())) {
    return new Response("Studio UI asset not found", { status: 404 });
  }
  return new Response(file, {
    headers: {
      "Content-Type": relativeFile.endsWith(".map")
        ? "application/json; charset=utf-8"
        : relativeFile.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Routes for the first-party Studio editor: the React shell, its bundled
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
    getEntityDisplay,
    workspaceRegistry,
  } = options;
  const normalizedBase = normalizeStudioBasePath(routePath);
  const shellPath = normalizedBase || "/";
  const assetPrefix = `${normalizedBase}/assets`;
  const assetPath = `${assetPrefix}/app.js`;
  const stylesheetPath = `${assetPrefix}/app.css`;
  const apiPath = (suffix: string): string => `${normalizedBase}/api/${suffix}`;

  const resolveRequestAccess = async (
    request: Request,
  ): Promise<StudioRequestAccessResolution> => {
    const principal = await resolveAuthPrincipal(request);
    if (principal?.status !== "active") {
      return { state: "unauthenticated" };
    }
    const visibilityScope = permissionToVisibilityScope(
      principal.permissionLevel,
    );
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
  ): Promise<StudioRequestAccess | Response> => {
    const resolution = await resolveRequestAccess(request);
    if (resolution.state === "unauthenticated") {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    return resolution.access;
  };

  const requireTrustedAccess = async (
    request: Request,
  ): Promise<StudioRequestAccess | Response> => {
    const access = await requireAccess(request);
    if (access instanceof Response) return access;
    return requireTrustedCapability(access) ?? access;
  };

  const serveShell = async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url);
    const nativeChat = requestUrl.pathname === STUDIO_CHAT_ROUTE_PATH;
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
    if (nativeChat && !resolveStudioChatApiPath(getContext())) {
      return new Response("Chat is not configured", { status: 404 });
    }
    return new Response(
      renderEditorShellHtml({
        assetPath,
        stylesheetPath,
        basePath: shellPath,
        surfaces: deriveConsoleSurfaces(getContext().webRoutes.getRoutes(), {
          activeId: "studio",
          permissionLevel: resolution.access.permissionLevel,
          hasActiveSession: true,
          self: { id: "studio", href: shellPath },
        }),
        sessionHref: `/logout?return_to=${encodeURIComponent(returnTo)}`,
        themeCSS: getContext().themeCSS,
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
      path: STUDIO_CHAT_ROUTE_PATH,
      method: "GET",
      public: true,
      handler: serveShell,
    },
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
      path: assetPrefix,
      match: "prefix",
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        serveStudioAsset(request, assetPrefix),
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
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        return handleGetSchema(getContext(), request, access);
      },
    },
    {
      path: apiPath("entities"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        return handleGetEntities(getContext(), request, access);
      },
    },
    {
      path: apiPath("entities"),
      method: "PUT",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
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
        const access = await requireTrustedAccess(request);
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
        const access = await requireTrustedAccess(request);
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
        const access = await requireTrustedAccess(request);
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
        const access = await requireTrustedAccess(request);
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
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        return handleListAgents(getContext(), request, access);
      },
    },
    {
      path: apiPath("ask-agent"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
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
  entityDisplay: StudioEntityDisplayMap | undefined,
  workspaceRegistry: StudioWorkspaceRegistry,
  access: StudioRequestAccess,
): Promise<Response> {
  const types = [];
  if (access.permissionLevel !== "public") {
    const counts = new Map(
      (await context.entityService.getEntityCounts(access.visibilityScope)).map(
        (entry) => [entry.entityType, entry.count],
      ),
    );
    for (const entityType of context.entityService.getEntityTypes()) {
      const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
      if (!schema) continue;
      const count = counts.get(entityType) ?? 0;
      const capabilities = deriveTypeCapabilities(
        context,
        entityType,
        count,
        access,
      );
      if (!capabilities) continue;
      const adapter = context.entities.getAdapter(entityType);
      types.push({
        entityType,
        label: entityTypeLabels(entityType, entityDisplay?.[entityType])
          .pluralLabel,
        isSingleton: adapter?.isSingleton === true,
        hasBody: adapter?.hasBody !== false,
        count,
        capabilities,
      });
    }
  }

  const workspaces = [
    ...listBuiltInStudioChatWorkspaces(
      access.permissionLevel,
      resolveStudioChatApiPath(context),
    ),
    ...listBuiltInStudioWorkspaces(access.permissionLevel),
    ...(await workspaceRegistry.listDescriptors(
      toStudioWorkspaceActor(access),
    )),
  ].sort(
    (left, right) =>
      left.priority - right.priority || left.id.localeCompare(right.id),
  );

  return jsonResponse({ types, workspaces });
}

async function handleGetWorkspace(
  workspaceRegistry: StudioWorkspaceRegistry,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id");
  if (!id) {
    return jsonResponse({ error: "id query parameter is required" }, 400);
  }

  const workspace = workspaceRegistry.get(id);
  if (!workspace) {
    return jsonResponse({ error: `Unknown Studio workspace: ${id}` }, 404);
  }

  const actor = toStudioWorkspaceActor(access);
  if (!(await workspace.accessHandler(actor))) {
    return jsonResponse({ error: `Unknown Studio workspace: ${id}` }, 404);
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
        error: getErrorMessage(error, "Studio workspace data provider failed"),
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
  workspaceRegistry: StudioWorkspaceRegistry,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof workspaceActionPayloadSchema>;
  try {
    payload = workspaceActionPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "Invalid workspace action payload" }, 400);
  }

  const workspace = workspaceRegistry.get(payload.id);
  if (!workspace) {
    return jsonResponse(
      { error: `Unknown Studio workspace: ${payload.id}` },
      404,
    );
  }
  const actor = toStudioWorkspaceActor(access);
  if (!(await workspace.accessHandler(actor))) {
    return jsonResponse(
      { error: `Unknown Studio workspace: ${payload.id}` },
      404,
    );
  }
  if (!workspace.actionHandler) {
    return jsonResponse(
      { error: `Studio workspace ${payload.id} does not provide actions` },
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
        error: getErrorMessage(error, "Studio workspace action failed"),
      },
      400,
    );
  }
}

async function handleGetSchema(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
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
        zodFieldToStudioWidget(name, schema.shape[name]),
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
