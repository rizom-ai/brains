import { getActiveAuthService } from "@brains/auth-service";
import {
  MessageInterfacePlugin,
  type EditMessageRequest,
  type InterfacePluginContext,
  type JobContext,
  type JobProgressEvent,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  type WebRouteDefinition,
  type ToolActivityEvent,
} from "@brains/plugins";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import packageJson from "../package.json";
import {
  handleDocumentAttachmentRequest as handleDocumentAttachmentRouteRequest,
  handleImageAttachmentRequest as handleImageAttachmentRouteRequest,
} from "./attachment-handlers";
import {
  chatRequestSchema,
  extractLastUserInput,
  extractLatestApprovalResponses,
} from "./chat-input";
import {
  type ActiveStream,
  handleStreamedChat as handleStreamedChatRoute,
  handleStreamedConfirmations as handleStreamedConfirmationsRoute,
  writeText as writeStreamText,
} from "./chat-stream";
import {
  webChatConfigSchema,
  type WebChatConfig,
  type WebChatConfigInput,
} from "./config";
import { toProgressData, toToolStatusData } from "./event-data";
import { renderChatPage, uiAssetFile } from "./chat-page";
import { handleJobStatusRequest as handleJobStatusRouteRequest } from "./job-handlers";
import { handleMessagesRequest as handleMessagesRouteRequest } from "./message-handlers";
import { createWebChatUploadStoreScope } from "./upload-store";
import { createWebChatRoutes } from "./web-routes";
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

const webChatInterfaceType = "web-chat";
type OperatorSessionResolver = (request: Request) => Promise<boolean>;

export interface WebChatDeps {
  /** Override how an operator session is detected (used in tests). */
  resolveOperatorSession?: OperatorSessionResolver;
}

const defaultResolveOperatorSession: OperatorSessionResolver = async (
  request,
) => {
  const authService = getActiveAuthService();
  if (!authService) return false;
  const session = await authService.getOperatorSession(request);
  return session !== undefined;
};

export class WebChatInterface extends MessageInterfacePlugin<
  WebChatConfig,
  WebChatConfigInput
> {
  declare protected config: WebChatConfig;
  private readonly activeStreams = new Map<string, ActiveStream>();
  private readonly resolveOperatorSession: OperatorSessionResolver;

  constructor(config: WebChatConfigInput = {}, deps: WebChatDeps = {}) {
    super("web-chat", packageJson, config, webChatConfigSchema);
    this.resolveOperatorSession =
      deps.resolveOperatorSession ?? defaultResolveOperatorSession;
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    context.endpoints.register({
      label: "Chat",
      url: this.config.routePath,
      priority: 15,
      visibility: "anchor",
    });
    context.interactions.register({
      id: "web-chat",
      label: "Chat",
      description: "Chat with this brain in the browser.",
      href: this.config.routePath,
      kind: "human",
      priority: 15,
      visibility: "anchor",
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
        handleDocumentAttachmentRequest: (request): Promise<Response> =>
          this.handleDocumentAttachmentRequest(request),
        handleImageAttachmentRequest: (request): Promise<Response> =>
          this.handleImageAttachmentRequest(request),
        handleJobStatusRequest: (request): Promise<Response> =>
          this.handleJobStatusRequest(request),
        handleUiAssetRequest: (): Promise<Response> =>
          this.handleUiAssetRequest(),
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
    this.writeText(stream.writer, request.message, "progress");
  }

  protected override async sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return undefined;
    return this.writeText(stream.writer, request.message, "progress");
  }

  protected override async editMessage(
    request: EditMessageRequest,
  ): Promise<boolean> {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return false;
    stream.writer.write({
      type: "data-progress",
      id: request.messageId,
      data: { message: request.newMessage },
      transient: true,
    });
    return true;
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  protected override async handleProgressEvent(
    event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    const channelId = event.metadata.channelId;
    if (
      event.metadata.interfaceType !== webChatInterfaceType ||
      typeof channelId !== "string"
    ) {
      return;
    }

    const stream = this.getActiveStream(channelId);
    if (!stream) return;

    stream.writer.write({
      type: "data-progress",
      id: `progress:${event.id}`,
      data: toProgressData(event),
      transient: event.status === "processing" || event.status === "pending",
    });
  }

  protected override async handleToolActivityEvent(
    event: ToolActivityEvent,
  ): Promise<void> {
    if (
      event.interfaceType !== webChatInterfaceType ||
      typeof event.channelId !== "string"
    ) {
      return;
    }

    const stream = this.getActiveStream(event.channelId);
    if (!stream) return;

    stream.writer.write({
      type: "data-status",
      id: this.createId("tool-status"),
      data: toToolStatusData(event),
      transient: true,
    });
  }

  private async handleChatPage(request: Request): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return this.createOperatorLoginRequiredResponse(request);
    }

    return new Response(renderChatPage(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  private async handleUiAssetRequest(): Promise<Response> {
    const file = Bun.file(uiAssetFile);
    if (!(await file.exists())) {
      return new Response("Web chat UI asset not built", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  private async handleUploadRequest(request: Request): Promise<Response> {
    return handleUploadRouteRequest(request, {
      resolveOperatorSession: this.resolveOperatorSession,
      getUploadStore: () =>
        this.getContext().uploads.scoped(createWebChatUploadStoreScope()),
    });
  }

  private async handleUploadDownloadRequest(
    request: Request,
  ): Promise<Response> {
    return handleUploadDownloadRouteRequest(request, {
      resolveOperatorSession: this.resolveOperatorSession,
      getUploadStore: () =>
        this.getContext().uploads.scoped(createWebChatUploadStoreScope()),
    });
  }

  private async handleChatRequest(request: Request): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return new Response("Forbidden", { status: 403 });
    }
    const permissionLevel = "anchor";

    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("Invalid chat request", { status: 400 });
    }

    const conversationId = parsed.data.id ?? this.createId("web");
    const approvalResponses = extractLatestApprovalResponses(parsed.data);
    const userInput =
      approvalResponses.length === 0
        ? await extractLastUserInput(parsed.data, {
            uploadStore: this.getContext().uploads.scoped(
              createWebChatUploadStoreScope(),
            ),
          })
        : { message: "", attachments: [] };
    if (userInput instanceof Response) return userInput;
    const { message, attachments, responseText } = userInput;
    const hasUserInput = message.length > 0 || attachments.length > 0;
    if (!hasUserInput && approvalResponses.length === 0) {
      return new Response("No user message found", { status: 400 });
    }

    const streamDeps = {
      activeStreams: this.activeStreams,
      agent: this.getContext().agent,
      startProcessingInput: (id: string): void => this.startProcessingInput(id),
      endProcessingInput: (): void => this.endProcessingInput(),
      createId: (prefix: string): string => this.createId(prefix),
    };
    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        if (approvalResponses.length > 0) {
          await handleStreamedConfirmationsRoute(
            {
              writer,
              conversationId,
              approvalResponses,
              permissionLevel,
              interfaceType: webChatInterfaceType,
            },
            streamDeps,
          );
          return;
        }

        if (responseText !== undefined) {
          this.writeText(writer, responseText, "text");
          return;
        }

        await handleStreamedChatRoute(
          {
            writer,
            conversationId,
            message,
            permissionLevel,
            attachments,
            interfaceType: webChatInterfaceType,
          },
          streamDeps,
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  private async handleSessionsRequest(request: Request): Promise<Response> {
    return handleSessionsRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolvePermissionLevel: (nextRequest) =>
        this.resolvePermissionLevel(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleDeleteSessionRequest(
    request: Request,
  ): Promise<Response> {
    return handleDeleteSessionRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolvePermissionLevel: (nextRequest) =>
        this.resolvePermissionLevel(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleRenameSessionRequest(
    request: Request,
  ): Promise<Response> {
    return handleRenameSessionRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolvePermissionLevel: (nextRequest) =>
        this.resolvePermissionLevel(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleArchiveSessionRequest(
    request: Request,
  ): Promise<Response> {
    return handleArchiveSessionRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolvePermissionLevel: (nextRequest) =>
        this.resolvePermissionLevel(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private async handleDocumentAttachmentRequest(
    request: Request,
  ): Promise<Response> {
    return handleDocumentAttachmentRouteRequest(request, {
      resolveOperatorSession: this.resolveOperatorSession,
      createOperatorLoginRequiredResponse: (nextRequest) =>
        this.createOperatorLoginRequiredResponse(nextRequest),
      entityService: this.getContext().entityService,
    });
  }

  private async handleImageAttachmentRequest(
    request: Request,
  ): Promise<Response> {
    return handleImageAttachmentRouteRequest(request, {
      resolveOperatorSession: this.resolveOperatorSession,
      createOperatorLoginRequiredResponse: (nextRequest) =>
        this.createOperatorLoginRequiredResponse(nextRequest),
      entityService: this.getContext().entityService,
    });
  }

  private async handleJobStatusRequest(request: Request): Promise<Response> {
    return handleJobStatusRouteRequest(request, {
      resolveOperatorSession: this.resolveOperatorSession,
      createOperatorLoginRequiredResponse: (nextRequest) =>
        this.createOperatorLoginRequiredResponse(nextRequest),
      jobs: this.getContext().jobs,
    });
  }

  private async handleMessagesRequest(request: Request): Promise<Response> {
    return handleMessagesRouteRequest(request, {
      conversations: this.getContext().conversations,
      resolvePermissionLevel: (nextRequest) =>
        this.resolvePermissionLevel(nextRequest),
      interfaceType: webChatInterfaceType,
    });
  }

  private getActiveStream(channelId: string | null): ActiveStream | undefined {
    if (!channelId) return undefined;
    return this.activeStreams.get(channelId);
  }

  private async resolvePermissionLevel(
    request: Request,
  ): Promise<"anchor" | "public"> {
    return (await this.resolveOperatorSession(request)) ? "anchor" : "public";
  }

  private createOperatorLoginRequiredResponse(request: Request): Response {
    const authService = getActiveAuthService();
    if (authService) return authService.createOperatorLoginResponse(request);

    return new Response("Operator login required", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  private writeText(
    writer: UIMessageStreamWriter<UIMessage>,
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
