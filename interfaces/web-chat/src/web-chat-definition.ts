import { requireSameOriginJson } from "@brains/auth-service";
import {
  defineMessageInterface,
  defineRoute,
  verbatim,
  z,
  type AnyInterfaceRouteDefinition,
  type ConsoleSurface,
  type IInboxNamespace,
  type IInterfaceConversationsNamespace,
  type InterfaceEntityReader,
  type InterfaceJobs,
  type MessageReceiver,
  type ScopedRuntimeUploadStore,
  type UserPermissionLevel,
} from "@brains/sdk/interfaces";
import { createChatApiPaths } from "@brains/contracts/chat";
import {
  handleDocumentAttachmentRequest,
  handleImageAttachmentRequest,
} from "./attachment-handlers";
import {
  createBrowserAccess,
  type BrowserAccessReader,
} from "./browser-access";
import type { WebChatConversationAccess } from "./conversation-access";
import { handleChatRequest } from "./chat-route";
import {
  renderChatPage,
  uiAssetFile,
  uiAssetPath,
  uiStylesheetFile,
  uiStylesheetPath,
} from "./chat-page";
import { writeAnswer, writeText, type ActiveStream } from "./chat-stream";
import { webChatConfigSchema, type WebChatConfig } from "./config";
import { handleContextSessionRequest } from "./context-session-handler";
import { toProgressData, toToolStatusData } from "./event-data";
import { createWebChatInboxPrefillState } from "./inbox-prefill-contract";
import { handleJobStatusRequest } from "./job-handlers";
import { handleMessagesRequest } from "./message-handlers";
import {
  handleActionRequest,
  handleRemoteAgentChatRequest,
  handleRemoteAgentConfirmRequest,
  type AgentRouteDeps,
} from "./agent-routes";
import {
  handleArchiveSessionRequest,
  handleDeleteSessionRequest,
  handleRenameSessionRequest,
  handleSessionsRequest,
} from "./session-handlers";
import { createWebChatUploadStoreScope } from "./upload-store";
import {
  handleUploadDownloadRequest,
  handleUploadRequest,
} from "./upload-handlers";

const webChatInterfaceType = "web-chat";

/**
 * What web-chat is holding while it runs.
 *
 * Almost all of it is a namespace the runtime handed over at setup, kept
 * because a route is a plain function over what it needs rather than a method
 * with a whole context behind it. The two that are web-chat's own are the
 * browser gate, which is a function of a principal and the conversation
 * store, and the streams it currently has open.
 */
interface WebChatState {
  access: BrowserAccessReader;
  /** One per turn in flight, keyed by the conversation the browser named. */
  activeStreams: Map<string, ActiveStream>;
  agent: AgentRouteDeps["agent"];
  messaging: AgentRouteDeps["messaging"];
  conversations: IInterfaceConversationsNamespace;
  entities: InterfaceEntityReader;
  inbox: IInboxNamespace;
  uploads: ScopedRuntimeUploadStore;
  surfaces: (options: {
    permissionLevel?: "admin" | "trusted" | "public" | undefined;
    hasActiveSession?: boolean | undefined;
    selfHref?: string | undefined;
  }) => readonly ConsoleSurface[];
  themeCSS: string;
  createId(prefix: string): string;
}

/**
 * A route that answers with a `Response` it wrote itself.
 *
 * Every route here is one: web-chat serves an HTML page, a built asset, an
 * event stream and a file download, none of which survive a JSON envelope.
 */
function rawRoute(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  handle: (request: Request) => Promise<Response>,
): AnyInterfaceRouteDefinition {
  return defineRoute({
    method,
    path,
    security: { kind: "public" },
    response: verbatim,
    handle: ({ request }) => handle(request),
  });
}

/** A file the UI build produced, or an honest 404 if it did not run. */
async function builtUiFile(
  path: string,
  contentType: string,
): Promise<Response> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return new Response("Web chat UI asset not built", { status: 404 });
  }
  return new Response(file, {
    headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
  });
}

function safeInboxContextLabel(title: string): string {
  const label = title.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
  return label || "Inbox item";
}

/**
 * The stream a channel currently has open, if any.
 *
 * Nothing is buffered for a channel with none: a browser that closed the tab
 * has nowhere to receive frames, and the transcript is what it reads on the
 * way back.
 */
function openStream(
  state: WebChatState,
  channelId: string,
): ActiveStream | undefined {
  return state.activeStreams.get(channelId);
}

/**
 * Chat in the browser, as one declaration.
 *
 * It is two things at once, which is why it needs both halves of the
 * interface setup: a chat channel that carries a conversation, and the
 * console people reach it through — serving its own page, its uploads, the
 * list of sessions someone has, and the files a conversation refers to.
 *
 * The turn itself is the runtime's. What stays here is how an answer reads on
 * a connection that is still open: one frame per piece, each with its own id,
 * so text renders as it lands and a tool row is replaced when the tool
 * finishes rather than reprinted underneath itself.
 */
const webChatInterface: ReturnType<typeof defineMessageInterface> =
  defineMessageInterface(
    {
      id: webChatInterfaceType,
      config: webChatConfigSchema,

      setup: (context): WebChatState => {
        const config: WebChatConfig = context.config;

        context.endpoints.register({
          label: "Chat",
          url: config.routePath,
          priority: 15,
          visibility: "trusted",
          requiresActiveSession: true,
        });
        context.interactions.register({
          id: webChatInterfaceType,
          label: "Chat",
          description: "Chat with this brain in the browser.",
          href: config.routePath,
          kind: "human",
          priority: 15,
          visibility: "trusted",
          requiresActiveSession: true,
        });
        context.inboxFollowUps.registerKind({
          kind: "discuss-in-chat",
          label: "Discuss in chat",
          priority: 10,
          mode: "universal",
          permissionLevel: "trusted",
          applies: () => true,
          resolve: ({ sourceId, item }) => {
            if (!context.inbox.getSource(sourceId)?.resolveDetail) {
              return undefined;
            }
            return {
              href: config.routePath,
              state: createWebChatInboxPrefillState(
                "Help me understand this Inbox item and decide what to do next.",
                {
                  sourceId,
                  itemId: item.id,
                  label: safeInboxContextLabel(item.title),
                },
              ),
            };
          },
        });

        return {
          access: createBrowserAccess({
            resolveAuthPrincipal: (request) =>
              context.auth.getCaller()?.resolveSession(request) ??
              Promise.resolve(undefined),
            createAuthLoginResponse: (request) =>
              context.auth.getCaller()?.createAuthLoginResponse(request) ??
              new Response("Authentication required", {
                status: 401,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              }),
            conversations: context.conversations,
          }),
          activeStreams: new Map<string, ActiveStream>(),
          agent: context.agent,
          messaging: context.messaging,
          conversations: context.conversations,
          entities: context.entities,
          inbox: context.inbox,
          // Scoped by the configured API path, because a stored upload's URL
          // has to point back at the endpoint that serves it.
          uploads: context.uploads(
            createWebChatUploadStoreScope(config.apiPath),
          ),
          surfaces: context.surfaces,
          themeCSS: context.themeCSS,
          createId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
        };
      },
      channel: {
        type: webChatInterfaceType,
        displayName: "Web Chat",
        subjectLabel: "Conversation",
        recipient: z.string(),
        // The browser holds the id: web-chat mints a session key, gates the
        // caller against the conversation stored under it, and gets it back on
        // the next turn.
        conversationKey: "channel",
      },
    },
    {
      routes: ({ config, state, jobs, messages }) =>
        webChatRoutes(config, state, jobs, messages),

      // An answer arrives on the connection the person is already holding, one
      // frame per piece. Nothing is returned: `send` would post a second,
      // plain-text copy of what these frames already carry.
      present: ({ state, channel, directives }) => {
        const stream = openStream(state, channel.id);
        if (!stream) return undefined;
        writeAnswer(stream.writer, directives, state.createId);
        return undefined;
      },

      // Job progress as the event, not a sentence about it: the client draws a
      // bar from the id, status and percentage, and would otherwise have to
      // parse one back out of prose.
      progress: ({ state, channel, event }) => {
        const stream = openStream(state, channel.id);
        stream?.writer.write({
          type: "data-progress",
          id: `progress:${event.id}`,
          data: toProgressData(event),
          transient:
            event.status === "processing" || event.status === "pending",
        });
      },

      // The same, for the other half: a tool's name and state, so the client
      // draws its own row and replaces it when the tool finishes.
      toolStatus: ({ state, channel, update }) => {
        const stream = openStream(state, channel.id);
        stream?.writer.write({
          type: "data-status",
          id: state.createId("tool-status"),
          data: toToolStatusData(update),
          transient: true,
        });
      },

      // What is left for prose: a notice the runtime sends outside an answer.
      send: ({ state, channel, message }) => {
        const stream = openStream(state, channel.id);
        if (!stream) return undefined;
        return writeText(
          stream.writer,
          message.text,
          "progress",
          state.createId,
        );
      },

      edit: ({ state, channel, messageId, message }) => {
        const stream = openStream(state, channel.id);
        stream?.writer.write({
          type: "data-progress",
          id: messageId,
          data: { message: message.text },
          transient: true,
        });
      },
    },
  );

function webChatRoutes(
  config: WebChatConfig,
  state: WebChatState,
  jobs: InterfaceJobs,
  messages: MessageReceiver,
): AnyInterfaceRouteDefinition[] {
  const paths = createChatApiPaths(config.apiPath);
  const agentDeps: AgentRouteDeps = {
    access: state.access,
    agent: state.agent,
    messaging: state.messaging,
    interfaceType: webChatInterfaceType,
  };
  const sessionDeps = {
    conversations: state.conversations,
    resolveAccess: (request: Request): Promise<WebChatConversationAccess> =>
      state.access.conversationAccess(request),
    interfaceType: webChatInterfaceType,
  };
  const attachmentDeps = {
    resolvePermissionLevel: (request: Request): Promise<UserPermissionLevel> =>
      state.access.permissionLevel(request),
    createAuthLoginRequiredResponse: (request: Request): Response =>
      state.access.loginRequired(request),
    entityService: state.entities,
  };
  const uploadDeps = {
    resolveAuthSession: (request: Request): Promise<boolean> =>
      state.access.hasSession(request),
    getUploadStore: (): ScopedRuntimeUploadStore => state.uploads,
  };

  return [
    rawRoute("GET", config.routePath, async (request) =>
      chatPage(config, state, request),
    ),
    rawRoute("POST", paths.stream, async (request) =>
      handleChatRequest(request, {
        access: state.access,
        messages,
        activeStreams: state.activeStreams,
        conversations: state.conversations,
        inbox: state.inbox,
        interfaceType: webChatInterfaceType,
        uploads: state.uploads,
        createId: state.createId,
      }),
    ),
    rawRoute("POST", paths.actions, async (request) =>
      handleActionRequest(request, agentDeps),
    ),
    rawRoute("GET", paths.sessions, async (request) =>
      handleSessionsRequest(request, sessionDeps),
    ),
    rawRoute("DELETE", paths.sessions, async (request) =>
      handleDeleteSessionRequest(request, sessionDeps),
    ),
    rawRoute("PUT", paths.sessions, async (request) =>
      handleRenameSessionRequest(request, sessionDeps),
    ),
    rawRoute("PUT", paths.sessionArchive, async (request) =>
      handleArchiveSessionRequest(request, sessionDeps),
    ),
    rawRoute("GET", paths.messages, async (request) =>
      handleMessagesRequest(request, sessionDeps),
    ),
    rawRoute("POST", paths.contextSessions, async (request) => {
      const requestDenied = requireSameOriginJson(request);
      if (requestDenied) return requestDenied;
      return handleContextSessionRequest(request, {
        ...sessionDeps,
        authorizeSource: async ({
          sourceId,
          itemId,
          permissionLevel,
          signal,
        }): Promise<boolean> => {
          const source = state.inbox.getSource(sourceId);
          if (!source?.resolveDetail) return false;
          await source.resolveDetail(itemId, { permissionLevel }, signal);
          return true;
        },
      });
    }),
    rawRoute("GET", paths.documentAttachments, async (request) =>
      handleDocumentAttachmentRequest(request, attachmentDeps),
    ),
    rawRoute("GET", paths.imageAttachments, async (request) =>
      handleImageAttachmentRequest(request, attachmentDeps),
    ),
    rawRoute("GET", paths.jobStatus, async (request) =>
      handleJobStatusRequest(request, {
        resolveAuthSession: (nextRequest) =>
          state.access.hasSession(nextRequest),
        createAuthLoginRequiredResponse: (nextRequest) =>
          state.access.loginRequired(nextRequest),
        jobs,
      }),
    ),
    rawRoute("GET", uiAssetPath, async () =>
      builtUiFile(uiAssetFile, "text/javascript; charset=utf-8"),
    ),
    rawRoute("GET", uiStylesheetPath, async () =>
      builtUiFile(uiStylesheetFile, "text/css; charset=utf-8"),
    ),
    rawRoute("POST", paths.uploads, async (request) =>
      handleUploadRequest(request, uploadDeps),
    ),
    rawRoute("GET", paths.uploads, async (request) =>
      handleUploadDownloadRequest(request, uploadDeps),
    ),
    rawRoute("POST", "/api/agent/chat", async (request) =>
      handleRemoteAgentChatRequest(request, agentDeps),
    ),
    rawRoute("POST", "/api/agent/chat/confirm", async (request) =>
      handleRemoteAgentConfirmRequest(request, agentDeps),
    ),
  ];
}

/**
 * The other doors the page's header links to.
 *
 * Asked of the runtime rather than read off the mounted route table: which
 * surfaces exist and what each one requires is the runtime's to know, and a
 * console matching plugin ids against paths is the coupling this package is
 * getting out of.
 *
 * `selfHref` is deliberately not passed. A surface given its own href always
 * resolves to it, which would hide the one thing worth asking — whether
 * another console owns the chat door. When Studio is mounted it does, and its
 * door is what the header offers.
 */
function headerDoors(
  config: WebChatConfig,
  state: WebChatState,
  permissionLevel: UserPermissionLevel,
): { dashboardHref: string; studioHref?: string } {
  const surfaces = state.surfaces({
    permissionLevel,
    hasActiveSession: true,
  });
  const chatDoor = surfaces.find(
    (surface) => surface.id === webChatInterfaceType,
  )?.href;
  return {
    dashboardHref:
      surfaces.find((surface) => surface.id === "dashboard")?.href ??
      "/dashboard",
    ...(chatDoor && chatDoor !== config.routePath
      ? { studioHref: chatDoor }
      : {}),
  };
}

async function chatPage(
  config: WebChatConfig,
  state: WebChatState,
  request: Request,
): Promise<Response> {
  const { principal, permissionLevel, hasChatAccess } =
    await state.access.resolve(request);
  if (!hasChatAccess || !principal) {
    return state.access.loginRequired(request);
  }

  const requestUrl = new URL(request.url);
  const returnTo = encodeURIComponent(
    `${requestUrl.pathname}${requestUrl.search}`,
  );
  return new Response(
    renderChatPage({
      apiPath: config.apiPath,
      ...headerDoors(config, state, permissionLevel),
      sessionHref: `/logout?return_to=${returnTo}`,
      themeCSS: state.themeCSS,
      principal: {
        displayName: principal.displayName,
        role: principal.role,
      },
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export default webChatInterface;
