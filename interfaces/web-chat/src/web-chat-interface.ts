import { requireSameOriginJson } from "@brains/auth-service";
import {
  MessageInterfacePlugin,
  type EditMessageRequest,
  type MessageInterfacePluginContext,
  type JobContext,
  type JobProgressEvent,
  type MessageInterfaceOutput,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  type WebRouteDefinition,
  type ToolStatusUpdate,
  type UserPermissionLevel,
} from "@brains/plugins";
import packageJson from "../package.json";
import {
  handleDocumentAttachmentRequest as handleDocumentAttachmentRouteRequest,
  handleImageAttachmentRequest as handleImageAttachmentRouteRequest,
} from "./attachment-handlers";
import { type ActiveStream, writeText as writeStreamText } from "./chat-stream";
import type { StreamWriter } from "./stream-writer";
import {
  webChatConfigSchema,
  type WebChatConfig,
  type WebChatConfigInput,
} from "./config";
import { toProgressData, toToolStatusData } from "./event-data";
import { type WebChatConversationAccess } from "./conversation-access";
import { handleContextSessionRequest as handleContextSessionRouteRequest } from "./context-session-handler";
import { deriveConsoleSurfaces } from "@brains/plugins";
import { renderChatPage, uiAssetFile, uiStylesheetFile } from "./chat-page";
import { handleJobStatusRequest as handleJobStatusRouteRequest } from "./job-handlers";
import { handleMessagesRequest as handleMessagesRouteRequest } from "./message-handlers";
import { createWebChatUploadStoreScope } from "./upload-store";
import {
  createBrowserAccess,
  type BrowserAccess,
  type BrowserAccessReader,
} from "./browser-access";
import {
  handleActionRequest as handleActionRouteRequest,
  handleRemoteAgentChatRequest as handleRemoteAgentChatRouteRequest,
  handleRemoteAgentConfirmRequest as handleRemoteAgentConfirmRouteRequest,
  type AgentRouteDeps,
} from "./agent-routes";
import { createWebChatRoutes } from "./web-routes";
import { createWebChatInboxPrefillState } from "./inbox-prefill-contract";
import {
  handleArchiveSessionRequest as handleArchiveSessionRouteRequest,
  handleDeleteSessionRequest as handleDeleteSessionRouteRequest,
  handleRenameSessionRequest as handleRenameSessionRouteRequest,
  handleSessionsRequest as handleSessionsRouteRequest,
} from "./session-handlers";
import {
  handleUploadDownloadRequest as handleUploadDownloadRouteRequest,
  handleUploadRequest as handleUploadRouteRequest,
} from "./upload-handlers";
import { handleChatRequest as handleChatRouteRequest } from "./chat-route";

const webChatInterfaceType = "web-chat";

export class WebChatInterface extends MessageInterfacePlugin<
  WebChatConfig,
  WebChatConfigInput
> {
  declare protected config: WebChatConfig;
  private readonly activeStreams = new Map<string, ActiveStream>();
  private accessReader: BrowserAccessReader | undefined;

  constructor(config: WebChatConfigInput = {}) {
    super("web-chat", packageJson, config, webChatConfigSchema);
  }

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    context.endpoints.register({
      label: "Chat",
      url: this.config.routePath,
      priority: 15,
      visibility: "trusted",
      requiresActiveSession: true,
    });
    context.interactions.register({
      id: "web-chat",
      label: "Chat",
      description: "Chat with this brain in the browser.",
      href: this.config.routePath,
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
        if (!context.inbox.getSource(sourceId)?.resolveDetail) return undefined;
        return {
          href: this.config.routePath,
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
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return createWebChatRoutes({
      routePath: this.config.routePath,
      apiPath: this.config.apiPath,
      handlers: {
        handleChatPage: (request): Promise<Response> =>
          this.handleChatPage(request),
        handleChatRequest: (request): Promise<Response> =>
          this.handleChatRequest(request),
        handleRemoteAgentChatRequest: (request): Promise<Response> =>
          this.handleRemoteAgentChatRequest(request),
        handleRemoteAgentConfirmRequest: (request): Promise<Response> =>
          this.handleRemoteAgentConfirmRequest(request),
        handleActionRequest: (request): Promise<Response> =>
          this.handleActionRequest(request),
        handleSessionsRequest: (request): Promise<Response> =>
          this.handleSessionsRequest(request),
        handleDeleteSessionRequest: (request): Promise<Response> =>
          this.handleDeleteSessionRequest(request),
        handleRenameSessionRequest: (request): Promise<Response> =>
          this.handleRenameSessionRequest(request),
        handleArchiveSessionRequest: (request): Promise<Response> =>
          this.handleArchiveSessionRequest(request),
        handleMessagesRequest: (request): Promise<Response> =>
          this.handleMessagesRequest(request),
        handleContextSessionRequest: (request): Promise<Response> =>
          this.handleContextSessionRequest(request),
        handleDocumentAttachmentRequest: (request): Promise<Response> =>
          this.handleDocumentAttachmentRequest(request),
        handleImageAttachmentRequest: (request): Promise<Response> =>
          this.handleImageAttachmentRequest(request),
        handleJobStatusRequest: (request): Promise<Response> =>
          this.handleJobStatusRequest(request),
        handleUiAssetRequest: (): Promise<Response> =>
          this.handleUiAssetRequest(),
        handleUiStylesheetRequest: (): Promise<Response> =>
          this.handleUiStylesheetRequest(),
        handleUploadRequest: (request): Promise<Response> =>
          this.handleUploadRequest(request),
        handleUploadDownloadRequest: (request): Promise<Response> =>
          this.handleUploadDownloadRequest(request),
      },
    });
  }

  protected override sendMessageToChannel(
    request: SendMessageToChannelRequest,
  ): void {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return;
    this.writeText(
      stream.writer,
      this.toTextOutput(request.message),
      "progress",
    );
  }

  protected override async sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return undefined;
    return this.writeText(
      stream.writer,
      this.toTextOutput(request.message),
      "progress",
    );
  }

  protected override async editMessage(
    request: EditMessageRequest,
  ): Promise<boolean> {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return false;
    stream.writer.write({
      type: "data-progress",
      id: request.messageId,
      data: { message: this.toTextOutput(request.newMessage) },
      transient: true,
    });
    return true;
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  private toTextOutput(output: MessageInterfaceOutput): string {
    return typeof output === "string" ? output : (output.fallbackText ?? "");
  }

  protected override async handleProgressEvent(
    event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    if (
      event.metadata.interfaceType !== webChatInterfaceType ||
      typeof event.metadata.conversationId !== "string"
    ) {
      return;
    }

    const stream = this.getActiveStream(event.metadata.conversationId);
    if (!stream) return;

    stream.writer.write({
      type: "data-progress",
      id: `progress:${event.id}`,
      data: toProgressData(event),
      transient: event.status === "processing" || event.status === "pending",
    });
  }

  protected override async handleToolStatusUpdate(
    update: ToolStatusUpdate,
  ): Promise<void> {
    if (
      update.interfaceType !== webChatInterfaceType ||
      typeof update.channelId !== "string"
    ) {
      return;
    }

    const stream = this.getActiveStream(update.channelId);
    if (!stream) return;

    stream.writer.write({
      type: "data-status",
      id: this.createId("tool-status"),
      data: toToolStatusData(update),
      transient: true,
    });
  }

  private async handleChatPage(request: Request): Promise<Response> {
    const { principal, permissionLevel, hasChatAccess } =
      await this.resolveBrowserAccess(request);
    if (!hasChatAccess) {
      return this.createAuthLoginRequiredResponse(request);
    }

    const requestUrl = new URL(request.url);
    const returnTo = encodeURIComponent(
      `${requestUrl.pathname}${requestUrl.search}`,
    );
    return new Response(
      renderChatPage({
        apiPath: this.config.apiPath,
        surfaces: deriveConsoleSurfaces(
          this.getContext().webRoutes.getRoutes(),
          {
            activeId: "web-chat",
            permissionLevel,
            hasActiveSession: principal !== undefined,
            self: { id: "web-chat", href: this.config.routePath },
          },
        ),
        sessionHref: `/logout?return_to=${returnTo}`,
        themeCSS: this.getContext().themeCSS,
      }),
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  /**
   * What the two agent-facing routes need, built from the running context.
   * The handlers themselves are module functions — none of this needed a
   * plugin to do.
   */
  private agentRouteDeps(): AgentRouteDeps {
    const context = this.getContext();
    return {
      access: this.access(),
      agent: context.agent,
      messaging: context.messaging,
      interfaceType: webChatInterfaceType,
    };
  }

  private async handleActionRequest(request: Request): Promise<Response> {
    return handleActionRouteRequest(request, this.agentRouteDeps());
  }

  private async handleUiAssetRequest(): Promise<Response> {
    return this.handleBuiltUiFile(
      uiAssetFile,
      "text/javascript; charset=utf-8",
    );
  }

  private async handleUiStylesheetRequest(): Promise<Response> {
    return this.handleBuiltUiFile(uiStylesheetFile, "text/css; charset=utf-8");
  }

  private async handleBuiltUiFile(
    path: string,
    contentType: string,
  ): Promise<Response> {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return new Response("Web chat UI asset not built", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  }

  private async handleUploadRequest(request: Request): Promise<Response> {
    return handleUploadRouteRequest(request, {
      resolveAuthSession: (nextRequest) =>
        this.access().hasSession(nextRequest),
      getUploadStore: () =>
        this.getContext().uploads.scoped(
          createWebChatUploadStoreScope(this.config.apiPath),
        ),
    });
  }

  private async handleUploadDownloadRequest(
    request: Request,
  ): Promise<Response> {
    return handleUploadDownloadRouteRequest(request, {
      resolveAuthSession: (nextRequest) =>
        this.access().hasSession(nextRequest),
      getUploadStore: () =>
        this.getContext().uploads.scoped(
          createWebChatUploadStoreScope(this.config.apiPath),
        ),
    });
  }

  private async handleRemoteAgentChatRequest(
    request: Request,
  ): Promise<Response> {
    return handleRemoteAgentChatRouteRequest(request, this.agentRouteDeps());
  }

  private async handleRemoteAgentConfirmRequest(
    request: Request,
  ): Promise<Response> {
    return handleRemoteAgentConfirmRouteRequest(request, this.agentRouteDeps());
  }

  /**
   * The browser's own turn, delegated whole.
   *
   * The route needs a stream, the agent, the conversation store and the
   * permission gate; naming those as dependencies is what let it move out of
   * the class, and is what a declared interface will hand it instead.
   */
  private async handleChatRequest(request: Request): Promise<Response> {
    const context = this.getContext();
    return handleChatRouteRequest(request, {
      access: this.access(),
      agent: context.agent,
      conversations: context.conversations,
      inbox: context.inbox,
      interfaceType: webChatInterfaceType,
      activeStreams: this.activeStreams,
      uploads: context.uploads.scoped(createWebChatUploadStoreScope()),
      entityService: {
        getEntity: (ref) => context.entityService.getEntity(ref),
      },
      displayBaseUrl:
        context.preferLocalUrls && context.localSiteUrl
          ? context.localSiteUrl
          : (context.siteUrl ?? context.localSiteUrl),
      startProcessingInput: (id) => this.startProcessingInput(id),
      endProcessingInput: () => this.endProcessingInput(),
      handleAgentResponseToolStatuses: (response, id) =>
        this.handleAgentResponseToolStatuses(response, id),
      createId: (prefix) => this.createId(prefix),
    });
  }

  private async handleContextSessionRequest(
    request: Request,
  ): Promise<Response> {
    const requestDenied = requireSameOriginJson(request);
    if (requestDenied) return requestDenied;

    return handleContextSessionRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolveAccess: (nextRequest) =>
        this.resolveConversationAccess(nextRequest),
      interfaceType: webChatInterfaceType,
      authorizeSource: async ({
        sourceId,
        itemId,
        permissionLevel,
        signal,
      }): Promise<boolean> => {
        const source = this.getContext().inbox.getSource(sourceId);
        if (!source?.resolveDetail) return false;
        await source.resolveDetail(itemId, { permissionLevel }, signal);
        return true;
      },
    });
  }

  private async handleSessionsRequest(request: Request): Promise<Response> {
    return handleSessionsRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolveAccess: (nextRequest) =>
        this.resolveConversationAccess(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleDeleteSessionRequest(
    request: Request,
  ): Promise<Response> {
    return handleDeleteSessionRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolveAccess: (nextRequest) =>
        this.resolveConversationAccess(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleRenameSessionRequest(
    request: Request,
  ): Promise<Response> {
    return handleRenameSessionRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolveAccess: (nextRequest) =>
        this.resolveConversationAccess(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleArchiveSessionRequest(
    request: Request,
  ): Promise<Response> {
    return handleArchiveSessionRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolveAccess: (nextRequest) =>
        this.resolveConversationAccess(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleDocumentAttachmentRequest(
    request: Request,
  ): Promise<Response> {
    return handleDocumentAttachmentRouteRequest(request, {
      resolvePermissionLevel: (nextRequest) =>
        this.resolveAttachmentPermissionLevel(nextRequest),
      createAuthLoginRequiredResponse: (nextRequest) =>
        this.createAuthLoginRequiredResponse(nextRequest),
      entityService: this.getContext().entityService,
    });
  }

  private async handleImageAttachmentRequest(
    request: Request,
  ): Promise<Response> {
    return handleImageAttachmentRouteRequest(request, {
      resolvePermissionLevel: (nextRequest) =>
        this.resolveAttachmentPermissionLevel(nextRequest),
      createAuthLoginRequiredResponse: (nextRequest) =>
        this.createAuthLoginRequiredResponse(nextRequest),
      entityService: this.getContext().entityService,
    });
  }

  private async handleJobStatusRequest(request: Request): Promise<Response> {
    return handleJobStatusRouteRequest(request, {
      resolveAuthSession: (nextRequest) =>
        this.access().hasSession(nextRequest),
      createAuthLoginRequiredResponse: (nextRequest) =>
        this.createAuthLoginRequiredResponse(nextRequest),
      jobs: this.getContext().jobs,
    });
  }

  private async handleMessagesRequest(request: Request): Promise<Response> {
    return handleMessagesRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolveAccess: (nextRequest) =>
        this.resolveConversationAccess(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  /**
   * The access reader, built against the runtime this plugin registered with.
   *
   * The logic itself lives in `browser-access.ts` — it is a function of a
   * principal and the conversation store, and needed no plugin to answer.
   */
  private access(): BrowserAccessReader {
    this.accessReader ??= createBrowserAccess({
      resolveAuthPrincipal: (request) =>
        this.getContext().auth.getCaller()?.resolveSession(request) ??
        Promise.resolve(undefined),
      createAuthLoginResponse: (request) => {
        const authService = this.getContext().auth.getCaller();
        return (
          authService?.createAuthLoginResponse(request) ??
          new Response("Authentication required", {
            status: 401,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      },
      conversations: this.getContext().conversations,
    });
    return this.accessReader;
  }

  private async resolveConversationAccess(
    request: Request,
  ): Promise<WebChatConversationAccess> {
    return this.access().conversationAccess(request);
  }

  private getActiveStream(channelId: string | null): ActiveStream | undefined {
    if (!channelId) return undefined;
    return this.activeStreams.get(channelId);
  }

  private async resolveBrowserAccess(request: Request): Promise<BrowserAccess> {
    return this.access().resolve(request);
  }

  private async resolveAttachmentPermissionLevel(
    request: Request,
  ): Promise<UserPermissionLevel> {
    return this.access().permissionLevel(request);
  }

  private createAuthLoginRequiredResponse(request: Request): Response {
    return this.access().loginRequired(request);
  }

  private writeText(
    writer: StreamWriter,
    text: string,
    prefix: string,
  ): string {
    return writeStreamText(writer, text, prefix, (nextPrefix) =>
      this.createId(nextPrefix),
    );
  }

  private createId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }
}

function safeInboxContextLabel(title: string): string {
  const label = title.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
  return label || "Inbox item";
}
