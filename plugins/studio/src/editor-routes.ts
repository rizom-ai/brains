import { join } from "node:path";
import {
  defineRoute,
  requireSameOriginJson,
  requireSameOriginRequest,
  verbatim,
  type AnyInterfaceRouteDefinition,
  type InterfaceCaller,
} from "@brains/sdk/services";
import { canWriteVisibility } from "@brains/sdk/entities";
import { DIRECTORY_SYNC_CHANNELS } from "@brains/contracts";
import { DEFAULT_CHAT_API_PATH } from "@brains/contracts/chat";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
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
  accessFor,
  deriveTypeCapabilities,
  getTypeCapabilities,
  requireAdminCapability,
  requireTrustedCapability,
  toStudioWorkspaceActor,
} from "./editor-access";
import type {
  StudioAuditRecorder,
  StudioRequestAccess,
} from "./editor-contracts";
import type { StudioRuntime } from "./runtime";

export type {
  StudioRequestAccess,
  StudioTypeCapabilities,
} from "./editor-contracts";

const CONTENT_VISIBILITIES = ["public", "shared", "restricted"] as const;

/**
 * Where the chat workspace sends its turns. Web-chat's API path is its own
 * configuration; the console reaches it at the contract's default, which is
 * what a brain composes it at unless it says otherwise.
 */
function resolveStudioChatApiPath(runtime: StudioRuntime): string | undefined {
  return runtime.plugins.has("web-chat") ? DEFAULT_CHAT_API_PATH : undefined;
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

/** What directory-sync answers, when it is there to answer. */
const syncStatusAnswerSchema = z.object({
  success: z.literal(true),
  data: syncStatusMessageSchema,
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

export interface EditorRouteOptions {
  /** Base route the editor is served from, e.g. "/studio". */
  readonly routePath: string;
}

/**
 * What a handler reaches once the console is set up. Routes are declared
 * from configuration alone, so a brain can say what it serves before any
 * of it runs; a handler asks for this at the moment a request arrives.
 */
export interface EditorRouteState {
  readonly runtime: StudioRuntime;
  readonly entityDisplay: StudioEntityDisplayMap | undefined;
  readonly workspaceRegistry: StudioWorkspaceRegistry;
  readonly recordAuditEvent: StudioAuditRecorder;
}

/**
 * Routes for the first-party Studio editor: the React shell, its bundled
 * assets, and the entity read/write API.
 *
 * The shell and assets are public routes that decide for themselves — the
 * shell redirects an anonymous visitor to sign in rather than refusing. The
 * API is declared `session`: the runtime resolves the signed-in person and
 * their role, and nothing here is asked who the caller is.
 */
export function createEditorRoutes(
  state: () => EditorRouteState,
  options: EditorRouteOptions,
): AnyInterfaceRouteDefinition[] {
  const { routePath } = options;
  const normalizedBase = normalizeStudioBasePath(routePath);
  const shellPath = normalizedBase || "/";
  const assetPrefix = `${normalizedBase}/assets`;
  const assetPath = `${assetPrefix}/app.js`;
  const stylesheetPath = `${assetPrefix}/app.css`;
  const apiPath = (suffix: string): string => `${normalizedBase}/api/${suffix}`;

  /** Who is asking, when the runtime already answered; the shell asks itself. */
  const resolveShellCaller = async (
    request: Request,
  ): Promise<InterfaceCaller | null> => {
    const principal = await state()
      .runtime.auth.getCaller()
      ?.resolveSession(request);
    if (principal?.status !== "active") return null;
    return {
      actor: {
        id: principal.userId,
        displayName: principal.displayName,
        ...(principal.canonicalId !== undefined
          ? { canonicalId: principal.canonicalId }
          : {}),
      },
      permission: principal.permissionLevel,
      isAnchor: principal.isAnchor,
    };
  };

  const serveShell = async (request: Request): Promise<Response> => {
    const { runtime } = state();
    const requestUrl = new URL(request.url);
    const nativeChat = requestUrl.pathname === STUDIO_CHAT_ROUTE_PATH;
    const returnTo = `${requestUrl.pathname}${requestUrl.search}`;
    const caller = await resolveShellCaller(request);
    if (!caller) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/login?return_to=${encodeURIComponent(returnTo)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (nativeChat && !resolveStudioChatApiPath(runtime)) {
      return new Response("Chat is not configured", { status: 404 });
    }
    const dashboardHref = runtime
      .surfaces({ permissionLevel: caller.permission, hasActiveSession: true })
      .find((surface) => surface.id === "dashboard")?.href;
    const profileName = runtime.identity.getProfile().name.trim();
    return new Response(
      renderEditorShellHtml({
        assetPath,
        stylesheetPath,
        basePath: shellPath,
        sessionHref: `/logout?return_to=${encodeURIComponent(returnTo)}`,
        dashboardHref: `${dashboardHref ?? "/dashboard"}?view=public`,
        brandName: profileName || "Brain",
        themeCSS: runtime.themeCSS,
        principal: {
          displayName: caller.actor.displayName ?? "",
          role: caller.permission,
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

  const shellRoute = (path: string): AnyInterfaceRouteDefinition =>
    defineRoute({
      method: "GET",
      path,
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) => serveShell(request),
    });

  /** An API route: the runtime resolved the session; the handler acts as it. */
  const api = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    suffix: string,
    handle: (
      request: Request,
      access: StudioRequestAccess,
      s: EditorRouteState,
    ) => Promise<Response> | Response,
    options: {
      trusted?: boolean;
      admin?: boolean;
      sameOrigin?: "json" | "request";
    } = {},
  ): AnyInterfaceRouteDefinition =>
    defineRoute({
      method,
      path: apiPath(suffix),
      security: { kind: "session" },
      response: verbatim,
      handle: async ({ request, caller }) => {
        const access = accessFor(caller);
        if (options.admin) {
          const denied = requireAdminCapability(access);
          if (denied) return denied;
        } else if (options.trusted) {
          const denied = requireTrustedCapability(access);
          if (denied) return denied;
        }
        if (options.sameOrigin === "json") {
          const denied = requireSameOriginJson(request);
          if (denied) return denied;
        } else if (options.sameOrigin === "request") {
          const denied = requireSameOriginRequest(request);
          if (denied) return denied;
        }
        return handle(request, access, state());
      },
    });

  return [
    shellRoute(STUDIO_CHAT_ROUTE_PATH),
    shellRoute(shellPath),
    // The React app owns every path under the mount; the shell serves them
    // all and the client router decides what is shown.
    defineRoute({
      method: "GET",
      path: `${normalizedBase}/entities`,
      match: "prefix",
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) => serveShell(request),
    }),
    defineRoute({
      method: "GET",
      path: `${normalizedBase}/workspaces`,
      match: "prefix",
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) => serveShell(request),
    }),
    defineRoute({
      method: "GET",
      path: assetPrefix,
      match: "prefix",
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) => serveStudioAsset(request, assetPrefix),
    }),
    api("GET", "types", (_request, access, s) =>
      handleListTypes(s.runtime, s.entityDisplay, s.workspaceRegistry, access),
    ),
    api("GET", "workspace", (request, access, s) =>
      handleGetWorkspace(s.workspaceRegistry, request, access),
    ),
    api(
      "POST",
      "workspace",
      (request, access, s) =>
        handleWorkspaceAction(s.workspaceRegistry, request, access),
      { sameOrigin: "json" },
    ),
    api(
      "GET",
      "schema",
      (request, access, s) => handleGetSchema(s.runtime, request, access),
      { trusted: true },
    ),
    api(
      "GET",
      "entities",
      (request, access, s) => handleGetEntities(s.runtime, request, access),
      { trusted: true },
    ),
    api(
      "PUT",
      "entities",
      (request, access, s) =>
        handleUpdateEntity(s.runtime, request, access, s.recordAuditEvent),
      { trusted: true, sameOrigin: "json" },
    ),
    api(
      "POST",
      "entities",
      (request, access, s) =>
        handleCreateEntity(s.runtime, request, access, s.recordAuditEvent),
      { trusted: true, sameOrigin: "json" },
    ),
    api(
      "DELETE",
      "entities",
      (request, access, s) =>
        handleDeleteEntity(s.runtime, request, access, s.recordAuditEvent),
      { trusted: true, sameOrigin: "json" },
    ),
    api(
      "POST",
      "upload",
      (request, access, s) =>
        handleUpload(s.runtime.operator, request, access, s.recordAuditEvent),
      { trusted: true, sameOrigin: "request" },
    ),
    api(
      "POST",
      "assist",
      (request, access, s) => handleAssist(s.runtime, request, access),
      { trusted: true, sameOrigin: "json" },
    ),
    api(
      "GET",
      "agents",
      (request, access, s) => handleListAgents(s.runtime, request, access),
      { trusted: true },
    ),
    api(
      "POST",
      "ask-agent",
      (request, access, s) => handleAskAgent(s.runtime, request, access),
      { trusted: true, sameOrigin: "json" },
    ),
    api(
      "GET",
      "sync-status",
      (_request, _access, s) => handleSyncStatus(s.runtime),
      {
        admin: true,
      },
    ),
  ];
}

/**
 * Save-pipeline status for the instrument strip: where the last write is
 * in the entity db → file export → git commit chain. Directory-sync answers
 * over the message bus; when it (or git) is absent the payload degrades to
 * nulls and the strip simply doesn't render those stations.
 */
async function handleSyncStatus(runtime: StudioRuntime): Promise<Response> {
  const unavailable = { directorySync: null, git: null };
  const answer = syncStatusAnswerSchema.safeParse(
    await runtime.messaging.request({
      type: DIRECTORY_SYNC_CHANNELS.statusRequest,
      payload: {},
    }),
  );
  if (!answer.success) {
    return jsonResponse(unavailable);
  }
  return jsonResponse({
    directorySync: {
      lastSync: answer.data.data.lastSync,
      watching: answer.data.data.watchEnabled,
    },
    git: answer.data.data.git,
  });
}

async function handleListTypes(
  runtime: StudioRuntime,
  entityDisplay: StudioEntityDisplayMap | undefined,
  workspaceRegistry: StudioWorkspaceRegistry,
  access: StudioRequestAccess,
): Promise<Response> {
  const types = [];
  if (access.permissionLevel !== "public") {
    const counts = new Map(
      (await runtime.entities.getEntityCounts(access.visibilityScope)).map(
        (entry) => [entry.entityType, entry.count],
      ),
    );
    for (const entityType of runtime.entities.getEntityTypes()) {
      if (!runtime.shapes.frontmatterSchema(entityType)) continue;
      const count = counts.get(entityType) ?? 0;
      const capabilities = deriveTypeCapabilities(
        runtime.operator,
        entityType,
        count,
        access,
      );
      if (!capabilities) continue;
      types.push({
        entityType,
        label: entityTypeLabels(entityType, entityDisplay?.[entityType])
          .pluralLabel,
        isSingleton: runtime.shapes.isSingleton(entityType),
        hasBody: runtime.shapes.hasBody(entityType),
        count,
        capabilities,
      });
    }
  }

  const workspaces = [
    ...listBuiltInStudioChatWorkspaces(
      access.permissionLevel,
      resolveStudioChatApiPath(runtime),
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
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const entityType = new URL(request.url).searchParams.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }

  const capabilities = await getTypeCapabilities(runtime, entityType, access);
  const schema = capabilities
    ? runtime.shapes.frontmatterSchema(entityType)
    : undefined;
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

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
    isSingleton: runtime.shapes.isSingleton(entityType),
    hasBody: raw || runtime.shapes.hasBody(entityType),
    fields,
  });
}
