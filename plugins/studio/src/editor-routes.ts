import {
  issuerFromRequest,
  requireSameOriginJson,
  requireSameOriginRequest,
  PermissionService,
  canWriteVisibility,
  entityTypeClassificationSchema,
  permissionToVisibilityScope,
} from "@brains/plugins";
import { join } from "node:path";
import { sdkErrorHttpStatus, toSdkError } from "@brains/contracts";
import { studioAssetManifestSchema, studioAssetPathSchema } from "./ui-assets";
import type {
  ServicePluginContext,
  UserPermissionLevel,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  MCP_INTERACTION_ID,
  directorySyncStatusContract,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  entityTypeLabels,
  isRawEntityType,
  studioTypeHierarchy,
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
import { jsonResponse } from "./editor-response";
import { handleGroupingRead, studioGroupDescriptors } from "./editor-groupings";
import { GROUPING_DEFINITIONS_TYPE } from "./grouping-definitions-contract";
import { isGroupingContributorType } from "./grouping-definitions";
import {
  handleCreateEntity,
  handleDeleteEntity,
  handleGetEntities,
  handleGetEntityHierarchy,
  handleGetImagePreview,
  handlePreviewDestination,
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
  StudioEntityTypeInfo,
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

export function resolveStudioChatApiPath(
  context: ServicePluginContext,
): string | undefined {
  return context.webRoutes.findByRole("chat-api")?.fullPath;
}

// Studio and web-chat share dist/ui in the bundled @rizom/brain. Studio's
// generated manifest maps its public asset names to package-owned files.
const uiAssetDirectory = join(import.meta.dir, "..", "dist", "ui");
const uiAssetManifestFile = join(
  uiAssetDirectory,
  "studio-asset-manifest.json",
);
async function readStudioAssetManifest(): Promise<
  z.output<typeof studioAssetManifestSchema>
> {
  return studioAssetManifestSchema.parse(
    await Bun.file(uiAssetManifestFile).json(),
  );
}

const workspaceActionPayloadSchema = z.object({
  id: z.string().trim().min(1),
  action: z.unknown(),
});

function isSafeStudioAssetPath(value: string): boolean {
  return studioAssetPathSchema.safeParse(value).success;
}

async function serveStudioAsset(
  request: Request,
  assetPrefix: string,
): Promise<Response> {
  const notFound = (): Response =>
    new Response("Studio UI asset not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(`${assetPrefix}/`)) {
    return notFound();
  }

  let publicPath: string;
  try {
    publicPath = decodeURIComponent(pathname.slice(assetPrefix.length + 1));
  } catch {
    return notFound();
  }
  if (!isSafeStudioAssetPath(publicPath)) {
    return notFound();
  }

  let manifest: z.output<typeof studioAssetManifestSchema>;
  try {
    manifest = await readStudioAssetManifest();
  } catch {
    // Missing builds fail closed, without caching the temporary error.
    return notFound();
  }

  const relativeFile = manifest.assets[publicPath];
  if (!relativeFile || !isSafeStudioAssetPath(relativeFile)) {
    return notFound();
  }
  const file = Bun.file(join(uiAssetDirectory, relativeFile));
  if (!(await file.exists())) {
    return notFound();
  }
  return new Response(file, {
    headers: {
      "Content-Type": relativeFile.endsWith(".map")
        ? "application/json; charset=utf-8"
        : relativeFile.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
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
    const context = getContext();
    const dashboardHref = context.webRoutes.findByRole("dashboard")?.fullPath;
    const profileName = context.identity.getProfile().name.trim();
    const mcpUrl = await resolveMcpUrl(
      context,
      request,
      resolution.access.principal.role,
    );
    let manifest: z.output<typeof studioAssetManifestSchema>;
    try {
      manifest = await readStudioAssetManifest();
    } catch {
      // A missing or invalid build must not advertise stale or mutable assets.
      return new Response("Studio editor UI assets not built", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new Response(
      renderEditorShellHtml({
        assetPath: `${assetPrefix}/${manifest.entrypoints.script}`,
        stylesheetPath: `${assetPrefix}/${manifest.entrypoints.stylesheet}`,
        basePath: shellPath,
        sessionHref: `/logout?return_to=${encodeURIComponent(returnTo)}`,
        dashboardHref: `${dashboardHref ?? "/dashboard"}?view=public`,
        brandName: profileName || "Brain",
        themeCSS: context.themeCSS,
        principal: {
          displayName: resolution.access.principal.displayName,
          role: resolution.access.principal.role,
        },
        mcpUrl,
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
      role: "studio-chat",
      handler: serveShell,
    },
    {
      path: shellPath,
      method: "GET",
      public: true,
      role: "studio",
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
      path: `${normalizedBase}/groups`,
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
      role: "studio-workspaces",
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
          options.getGroupingDefinitions,
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
      path: apiPath("members"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        return jsonResponse({ members: (await options.listMembers?.()) ?? [] });
      },
    },
    {
      path: apiPath("schema"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        return handleGetSchema(getContext(), request, access, options);
      },
    },
    {
      path: apiPath("images"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        return handleGetImagePreview(getContext(), request, access);
      },
    },
    {
      path: apiPath("destination"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        const denied = requireSameOriginJson(request);
        if (denied) return denied;
        return handlePreviewDestination(getContext(), request, access);
      },
    },
    ...(["catalog", "members", "usage"] as const).map(
      (mode): WebRouteDefinition => ({
        path: apiPath(`groups/${mode}`),
        method: "GET",
        public: true,
        handler: async (request): Promise<Response> => {
          const access = await requireTrustedAccess(request);
          if (access instanceof Response) return access;
          return handleGroupingRead(
            getContext(),
            request,
            access,
            mode,
            options.getGroupingDefinitions,
          );
        },
      }),
    ),
    {
      path: apiPath("hierarchy"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const access = await requireTrustedAccess(request);
        if (access instanceof Response) return access;
        return handleGetEntityHierarchy(getContext(), request, access);
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
  const result = await context.messaging.request(
    directorySyncStatusContract,
    {},
  );
  if (result.status !== "answered") {
    return jsonResponse({ directorySync: null, git: null });
  }

  return jsonResponse({
    directorySync: {
      lastSync: result.data.lastSync,
      watching: result.data.watchEnabled,
    },
    git: result.data.git,
  });
}

async function handleListTypes(
  context: ServicePluginContext,
  entityDisplay: StudioEntityDisplayMap | undefined,
  workspaceRegistry: StudioWorkspaceRegistry,
  access: StudioRequestAccess,
  getDefinitions: EditorRouteOptions["getGroupingDefinitions"],
): Promise<Response> {
  const types: StudioEntityTypeInfo[] = [];
  if (access.permissionLevel !== "public") {
    await context.entities.ensureGroupingsCurrent();
    const counts = new Map(
      (await context.entityService.getEntityCounts(access.visibilityScope)).map(
        (entry) => [entry.entityType, entry.count],
      ),
    );
    const registered = context.entityService.getEntityTypes();
    const containers = new Set(
      registered.flatMap((type) => {
        const container =
          context.entityService.getEntityTypeConfig(type).containedIn;
        return container === undefined ? [] : [container];
      }),
    );
    for (const entityType of registered) {
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
      const containedIn =
        context.entityService.getEntityTypeConfig(entityType).containedIn;
      const labels = entityTypeLabels(entityType, entityDisplay?.[entityType]);
      types.push({
        entityType,
        classification: entityTypeClassificationSchema.parse(
          context.entityService.getEntityTypeConfig(entityType).classification,
        ),
        label: labels.pluralLabel,
        singularLabel: labels.label,
        isSingleton: adapter?.isSingleton === true,
        hasBody: adapter?.hasBody !== false,
        count,
        capabilities,
        // A container's ids are flat; its folders hold its contents.
        hierarchy: containers.has(entityType)
          ? { ...studioTypeHierarchy(entityType), nested: false }
          : studioTypeHierarchy(entityType),
        ...(containedIn !== undefined && { containedIn }),
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

  const groupings = studioGroupDescriptors(
    getDefinitions?.().groupings ?? {},
    new Set(
      types
        .map((type) => type.entityType)
        .filter((type) => isGroupingContributorType(context, type)),
    ),
  );
  return jsonResponse({ types, workspaces, groupings });
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
    return workspaceFailure(error, request);
  }
}

/**
 * A workspace's failure in its public form, `{ error, code }`, with the status
 * its code names: never 502, which a proxy in front of the brain (Cloudflare)
 * replaces with its own page. The diagnostic is the declaring package's to
 * log, and the runtime has logged it there.
 */
function workspaceFailure(error: unknown, request: Request): Response {
  const { code, message } = toSdkError(
    error,
    request.signal.aborted ? "cancelled" : "handler_failed",
  ).toJSON();
  return jsonResponse({ error: message, code }, sdkErrorHttpStatus(code));
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
    return workspaceFailure(error, request);
  }
}

async function handleGetSchema(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
  options: EditorRouteOptions,
): Promise<Response> {
  const entityType = new URL(request.url).searchParams.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }

  await context.entities.ensureGroupingsCurrent();
  const capabilities = await getTypeCapabilities(context, entityType, access);
  const schema = capabilities
    ? context.entities.getEffectiveFrontmatterSchema(entityType)
    : undefined;
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const adapter = context.entities.getAdapter(entityType);
  const raw = isRawEntityType(entityType, context.entities);
  // Raw types edit the whole document as body; their domain frontmatter
  // bookkeeping must not surface. Visibility is system-owned and applies to
  // every entity type independently of its markdown representation.
  const definitions = options.getGroupingDefinitions?.();
  const labels = new Map(
    Object.entries(definitions?.groupings ?? {})
      .filter(
        ([, definition]) =>
          isGroupingContributorType(context, entityType) &&
          !definition.excludeTypes?.includes(entityType),
      )
      .map(([key, definition]) => [key, definition.label]),
  );
  const domainFields = raw
    ? []
    : Object.keys(schema.shape).flatMap((name) => {
        const field = zodFieldToStudioWidget(name, schema.shape[name]);
        if (field.widget === "hidden") return [];
        const label = labels.get(name);
        return [label === undefined ? field : { ...field, label }];
      });
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
  // Definitions have exactly one workable visibility: the editors they
  // constrain must be able to read them. Offering a choice invites a list
  // that silently refuses saves nobody can explain.
  const fields =
    entityType === GROUPING_DEFINITIONS_TYPE
      ? domainFields
      : [...domainFields, visibilityField];

  const contributorTypes: Array<{ entityType: string; label: string }> = [];
  // Preserve authored exclusions, but never render registered system types as
  // selectable "unavailable" choices. Only echo names already in this document.
  const systemTypes = (definitions?.excludedTypes ?? []).filter(
    (type) =>
      context.entityService.getEntityTypeConfig(type).classification ===
      "system",
  );
  if (entityType === GROUPING_DEFINITIONS_TYPE) {
    const display = options.getEntityDisplay();
    for (const type of context.entityService.getEntityTypes()) {
      if (
        isGroupingContributorType(context, type) &&
        (await getTypeCapabilities(context, type, access))
      ) {
        contributorTypes.push({
          entityType: type,
          label: entityTypeLabels(type, display?.[type]).pluralLabel,
        });
      }
    }
  }
  return jsonResponse({
    ...(entityType === GROUPING_DEFINITIONS_TYPE && {
      groupingDefinitions: {
        contributorTypes,
        systemTypes,
        issues: definitions?.issues ?? [],
      },
    }),
    entityType,
    format: raw ? "raw" : "frontmatter",
    isSingleton: adapter?.isSingleton === true,
    hasBody: raw || adapter?.hasBody !== false,
    fields,
  });
}

/**
 * The address AI tools connect to, when this brain serves MCP over HTTP and the
 * person's role can use it. Built from the request's public origin, the same
 * one OAuth issues tokens for.
 */
async function resolveMcpUrl(
  context: ServicePluginContext,
  request: Request,
  role: UserPermissionLevel,
): Promise<string | undefined> {
  const appInfo = await context.identity.getAppInfo().catch(() => undefined);
  const mcp = appInfo?.interactions.find(
    (interaction) =>
      interaction.id === MCP_INTERACTION_ID && interaction.href.startsWith("/"),
  );
  if (!mcp || !PermissionService.hasPermission(role, mcp.visibility)) {
    return undefined;
  }
  return `${issuerFromRequest(request)}${mcp.href}`;
}
