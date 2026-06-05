import { getActiveAuthService } from "@brains/auth-service";
import {
  MessageInterfacePlugin,
  type EditMessageRequest,
  type InterfacePluginContext,
  type JobContext,
  type JobProgressEvent,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  type StructuredChatCard,
  type WebRouteDefinition,
  resolveUploadFollowUp,
  type ChatAttachment,
  type ToolActivityEvent,
} from "@brains/plugins";
import { z } from "@brains/utils";
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
import { webChatConfigSchema, type WebChatConfig } from "./config";
import { toProgressData, toToolStatusData } from "./event-data";
import { renderChatPage, uiAssetFile, uiAssetPath } from "./chat-page";
import { handleJobStatusRequest as handleJobStatusRouteRequest } from "./job-handlers";
import {
  handleMessagesRequest as handleMessagesRouteRequest,
  parseStoredMessageMetadata,
} from "./message-handlers";
import {
  createWebChatUploadStoreScope,
  webChatUploadIdPattern,
  webChatUploadRefKind,
} from "./upload-store";
import {
  handleArchiveSessionRequest as handleArchiveSessionRouteRequest,
  handleDeleteSessionRequest as handleDeleteSessionRouteRequest,
  handleRenameSessionRequest as handleRenameSessionRouteRequest,
  handleSessionsRequest as handleSessionsRouteRequest,
} from "./session-handlers";
import {
  handleUploadDownloadRequest as handleUploadDownloadRouteRequest,
  handleUploadRequest as handleUploadRouteRequest,
  resolveInlineUploadPart as resolveInlineUploadFilePart,
  resolveReferencedUpload as resolveReferencedUploadPart,
} from "./upload-handlers";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  url: z.string(),
});

const approvalResponsePartSchema = z
  .object({
    state: z.literal("approval-responded"),
    approval: z.object({
      id: z.string(),
      approved: z.boolean(),
    }),
  })
  .passthrough();

const uiMessageSchema = z.object({
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
});

const chatRequestSchema = z.object({
  id: z.string().optional(),
  messages: z.array(uiMessageSchema).min(1),
  trigger: z.string().optional(),
});

const webChatInterfaceType = "web-chat";
const uploadRefSchema = z.object({
  kind: z.literal(webChatUploadRefKind),
  id: z.string().regex(webChatUploadIdPattern),
});

const uploadRefPartSchema = z.object({
  type: z.literal("data-upload"),
  data: z.object({
    ref: uploadRefSchema,
  }),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;
type ApprovalResponse = z.infer<typeof approvalResponsePartSchema>["approval"];
interface ParsedUserInput {
  message: string;
  attachments: ChatAttachment[];
  responseText?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ActiveStream {
  writer: UIMessageStreamWriter<UIMessage>;
}

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

export class WebChatInterface extends MessageInterfacePlugin<WebChatConfig> {
  declare protected config: WebChatConfig;
  private readonly activeStreams = new Map<string, ActiveStream>();
  private readonly resolveOperatorSession: OperatorSessionResolver;

  constructor(config: Partial<WebChatConfig> = {}, deps: WebChatDeps = {}) {
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
    return [
      {
        path: this.config.routePath,
        method: "GET",
        public: true,
        handler: (request): Promise<Response> => this.handleChatPage(request),
      },
      {
        path: this.config.apiPath,
        method: "POST",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleChatRequest(request),
      },
      {
        path: "/api/chat/sessions",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleSessionsRequest(request),
      },
      {
        path: "/api/chat/sessions",
        method: "DELETE",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleDeleteSessionRequest(request),
      },
      {
        path: "/api/chat/sessions",
        method: "PUT",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleRenameSessionRequest(request),
      },
      {
        path: "/api/chat/sessions/archive",
        method: "PUT",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleArchiveSessionRequest(request),
      },
      {
        path: "/api/chat/messages",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleMessagesRequest(request),
      },
      {
        path: "/api/chat/attachments/document",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleDocumentAttachmentRequest(request),
      },
      {
        path: "/api/chat/attachments/image",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleImageAttachmentRequest(request),
      },
      {
        path: "/api/chat/jobs/status",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleJobStatusRequest(request),
      },
      {
        path: uiAssetPath,
        method: "GET",
        public: true,
        handler: (): Promise<Response> => this.handleUiAssetRequest(),
      },
      {
        path: "/api/chat/uploads",
        method: "POST",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleUploadRequest(request),
      },
      {
        path: "/api/chat/uploads",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleUploadDownloadRequest(request),
      },
    ];
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
    const userInput = await this.extractLastUserInput(
      parsed.data,
      conversationId,
    );
    if (userInput instanceof Response) return userInput;
    const { message, attachments, responseText } = userInput;
    const hasUserInput = message.length > 0 || attachments.length > 0;
    const approvalResponses = hasUserInput
      ? []
      : this.extractLatestApprovalResponses(parsed.data);
    if (!hasUserInput && approvalResponses.length === 0) {
      return new Response("No user message found", { status: 400 });
    }

    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        if (approvalResponses.length > 0) {
          await this.handleStreamedConfirmations({
            writer,
            conversationId,
            approvalResponses,
          });
          return;
        }

        if (responseText !== undefined) {
          this.writeText(writer, responseText, "text");
          return;
        }

        await this.handleStreamedChat({
          writer,
          conversationId,
          message,
          permissionLevel,
          attachments,
        });
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

  private async handleStreamedChat(input: {
    writer: UIMessageStreamWriter<UIMessage>;
    conversationId: string;
    message: string;
    permissionLevel: "anchor" | "public";
    attachments: ChatAttachment[];
  }): Promise<void> {
    this.activeStreams.set(input.conversationId, { writer: input.writer });
    this.startProcessingInput(input.conversationId);
    input.writer.write({
      type: "data-status",
      id: this.createId("status"),
      data: { status: "thinking" },
      transient: true,
    });

    try {
      const response = await this.getContext().agent.chat(
        input.message,
        input.conversationId,
        {
          userPermissionLevel: input.permissionLevel,
          interfaceType: webChatInterfaceType,
          channelId: input.conversationId,
          channelName: "Web Chat",
          attachments: input.attachments,
        },
      );

      this.writeText(input.writer, response.text, "text");
      for (const toolResult of response.toolResults ?? []) {
        input.writer.write({
          type: "data-tool-result",
          id: this.createId("tool"),
          data: toolResult,
        });
      }
      this.writeStructuredCards(input.writer, response.cards ?? []);
    } finally {
      this.endProcessingInput();
      this.activeStreams.delete(input.conversationId);
    }
  }

  private async handleStreamedConfirmations(input: {
    writer: UIMessageStreamWriter<UIMessage>;
    conversationId: string;
    approvalResponses: ApprovalResponse[];
  }): Promise<void> {
    this.activeStreams.set(input.conversationId, { writer: input.writer });
    this.startProcessingInput(input.conversationId);
    const allApproved = input.approvalResponses.every(
      (approvalResponse) => approvalResponse.approved,
    );
    input.writer.write({
      type: "data-status",
      id: this.createId("status"),
      data: { status: allApproved ? "approving" : "resolving approvals" },
      transient: true,
    });

    try {
      for (const approvalResponse of input.approvalResponses) {
        const response = await this.getContext().agent.confirmPendingAction(
          input.conversationId,
          approvalResponse.approved,
          approvalResponse.id,
        );
        this.writeText(input.writer, response.text, "text");
        this.writeStructuredCards(input.writer, response.cards ?? []);
      }
    } finally {
      this.endProcessingInput();
      this.activeStreams.delete(input.conversationId);
    }
  }

  private writeStructuredCards(
    writer: UIMessageStreamWriter<UIMessage>,
    cards: StructuredChatCard[],
  ): void {
    for (const card of cards) {
      if (card.kind === "attachment") {
        writer.write({
          type: "data-attachment",
          id: card.id,
          data: card,
        });
        continue;
      }

      const toolCallId = card.toolCallId ?? card.id;
      const input = card.input ?? {};
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: card.toolName,
        input,
        dynamic: true,
        title: card.preview
          ? `${card.summary}\n\n${card.preview}`
          : card.summary,
      });
      switch (card.state) {
        case "approval-requested":
          writer.write({
            type: "tool-approval-request",
            approvalId: card.id,
            toolCallId,
          });
          break;
        case "approval-responded":
          // Agent skips this state — it transitions directly from
          // approval-requested to one of the output-* states.
          break;
        case "output-available":
          writer.write({
            type: "tool-output-available",
            toolCallId,
            output: card.output,
            dynamic: true,
          });
          break;
        case "output-error":
          writer.write({
            type: "tool-output-error",
            toolCallId,
            errorText: card.error ?? "Tool failed",
            dynamic: true,
          });
          break;
        case "output-denied":
          writer.write({
            type: "tool-output-denied",
            toolCallId,
          });
          break;
      }
    }
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

  private async extractLastUserInput(
    request: ChatRequest,
    conversationId: string,
  ): Promise<ParsedUserInput | Response> {
    const lastUserMessage = this.findLastUserMessage(request);
    if (!lastUserMessage) return { message: "", attachments: [] };

    const messageParts: string[] = [];
    const attachments: ChatAttachment[] = [];
    for (const part of lastUserMessage.parts ?? []) {
      const parsedText = textPartSchema.safeParse(part);
      if (parsedText.success) {
        if (parsedText.data.text.length > 0) {
          messageParts.push(parsedText.data.text);
        }
        continue;
      }

      const parsedFile = filePartSchema.safeParse(part);
      if (parsedFile.success) {
        const attachment = this.resolveInlineUploadPart(parsedFile.data);
        if (attachment instanceof Response) return attachment;
        attachments.push(attachment);
        continue;
      }

      const parsedUploadRef = uploadRefPartSchema.safeParse(part);
      if (parsedUploadRef.success) {
        const attachment = await this.resolveReferencedUpload(
          parsedUploadRef.data.data.ref.id,
        );
        if (attachment instanceof Response) return attachment;
        attachments.push(attachment);
        continue;
      }

      if (this.getPartType(part) === "data-upload") {
        return new Response("Invalid upload ref", { status: 400 });
      }
    }

    const message =
      messageParts.length > 0
        ? messageParts.join("\n\n")
        : (lastUserMessage.content ?? "");

    if (attachments.length === 0) {
      const deferred = await this.resolveDeferredUploadReference(
        request,
        conversationId,
        lastUserMessage,
        message,
      );
      if (deferred instanceof Response) return deferred;
      if (deferred !== null) {
        return {
          message: deferred.message ?? message,
          attachments: deferred.attachments,
          ...(deferred.responseText !== undefined
            ? { responseText: deferred.responseText }
            : {}),
        };
      }
    }

    return {
      message,
      attachments,
    };
  }

  private async resolveDeferredUploadReference(
    request: ChatRequest,
    conversationId: string,
    lastUserMessage: ChatRequest["messages"][number],
    message: string,
  ): Promise<
    | (Pick<ParsedUserInput, "attachments"> &
        Partial<Pick<ParsedUserInput, "message" | "responseText">>)
    | null
  > {
    const uploadIds = await this.collectPriorUploadIds(
      request,
      conversationId,
      lastUserMessage,
    );
    const attachments: ChatAttachment[] = [];
    for (const uploadId of uploadIds) {
      const attachment = await this.resolveReferencedUpload(uploadId);
      if (attachment instanceof Response) continue;
      attachments.push(attachment);
    }

    if (attachments.length === 0) return null;

    const selectableCandidates = attachments.flatMap((attachment) => {
      const id = attachment.source?.id;
      return id
        ? [
            {
              id,
              filename: attachment.filename,
              mediaType: attachment.mediaType,
              attachment,
            },
          ]
        : [];
    });

    const resolution = resolveUploadFollowUp({
      message,
      history: this.buildUploadHistory(request, lastUserMessage),
      candidates: selectableCandidates,
    });
    if (resolution === null) return null;

    if (resolution.kind === "selected") {
      return {
        message: resolution.actionMessage,
        attachments: [resolution.candidate.attachment],
      };
    }

    return this.buildUploadClarificationResponse(
      resolution.candidates.map((candidate) => candidate.attachment),
    );
  }

  private buildUploadClarificationResponse(
    candidates: ChatAttachment[],
  ): Pick<ParsedUserInput, "attachments" | "responseText"> {
    return {
      attachments: [],
      responseText: `Which uploaded file should I use? ${candidates
        .map((candidate) => `\`${candidate.filename}\``)
        .join(", ")}`,
    };
  }

  private buildUploadHistory(
    request: ChatRequest,
    lastUserMessage: ChatRequest["messages"][number],
  ): Array<{ role: string; text: string }> {
    const lastUserIndex = request.messages.indexOf(lastUserMessage);
    return request.messages
      .slice(0, lastUserIndex === -1 ? request.messages.length : lastUserIndex)
      .map((message) => ({
        role: message.role,
        text: this.getChatRequestMessageText(message),
      }));
  }

  private getChatRequestMessageText(
    message: ChatRequest["messages"][number],
  ): string {
    const textParts = (message.parts ?? []).flatMap((part) => {
      const parsedText = textPartSchema.safeParse(part);
      return parsedText.success ? [parsedText.data.text] : [];
    });
    return textParts.length > 0
      ? textParts.join("\n\n")
      : (message.content ?? "");
  }

  private async collectPriorUploadIds(
    request: ChatRequest,
    conversationId: string,
    lastUserMessage: ChatRequest["messages"][number],
  ): Promise<string[]> {
    const ids: string[] = [];
    const seen = new Set<string>();
    const add = (uploadId: string): void => {
      if (seen.has(uploadId)) return;
      seen.add(uploadId);
      ids.push(uploadId);
    };

    const lastUserIndex = request.messages.indexOf(lastUserMessage);
    const priorMessages = request.messages.slice(
      0,
      lastUserIndex === -1 ? request.messages.length : lastUserIndex,
    );
    for (const message of priorMessages) {
      if (message.role !== "user") continue;
      for (const part of message.parts ?? []) {
        const parsedUploadRef = uploadRefPartSchema.safeParse(part);
        if (parsedUploadRef.success) {
          add(parsedUploadRef.data.data.ref.id);
        }
      }
    }

    const storedMessages = await this.getContext().conversations.getMessages(
      conversationId,
      { limit: 50 },
    );
    for (const message of storedMessages) {
      if (message.role !== "user") continue;
      const parsedMetadata = parseStoredMessageMetadata(message.metadata);
      const attachments = parsedMetadata?.["attachments"];
      if (!Array.isArray(attachments)) continue;
      for (const attachment of attachments) {
        if (!isRecord(attachment)) continue;
        const source = attachment["source"];
        if (!isRecord(source)) continue;
        if (source["kind"] !== webChatUploadRefKind) continue;
        const uploadId = source["id"];
        if (
          typeof uploadId === "string" &&
          webChatUploadIdPattern.test(uploadId)
        ) {
          add(uploadId);
        }
      }
    }

    return ids;
  }

  private getPartType(part: unknown): string | undefined {
    if (typeof part !== "object" || part === null || !("type" in part)) {
      return undefined;
    }
    const type = part.type;
    return typeof type === "string" ? type : undefined;
  }

  private resolveInlineUploadPart(
    file: z.infer<typeof filePartSchema>,
  ): ChatAttachment | Response {
    return resolveInlineUploadFilePart(file);
  }

  private async resolveReferencedUpload(
    uploadId: string,
  ): Promise<ChatAttachment | Response> {
    return resolveReferencedUploadPart(
      uploadId,
      this.getContext().uploads.scoped(createWebChatUploadStoreScope()),
    );
  }

  private extractLatestApprovalResponses(
    request: ChatRequest,
  ): ApprovalResponse[] {
    // Clients resend the full message history on every turn, but only the
    // trailing assistant message carries this turn's approval responses.
    // Scanning earlier messages would replay decisions the agent already
    // executed.
    const lastMessage = request.messages.at(-1);
    if (!lastMessage || lastMessage.role === "user") return [];

    return (lastMessage.parts ?? [])
      .map((part) => approvalResponsePartSchema.safeParse(part))
      .filter((result) => result.success)
      .map((result) => result.data.approval);
  }

  private findLastUserMessage(
    request: ChatRequest,
  ): ChatRequest["messages"][number] | undefined {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
      const message = request.messages[index];
      if (message?.role === "user") return message;
    }
    return undefined;
  }

  private writeText(
    writer: UIMessageStreamWriter<UIMessage>,
    text: string,
    prefix: string,
  ): string {
    const id = this.createId(prefix);
    writer.write({ type: "text-start", id });
    writer.write({ type: "text-delta", id, delta: text });
    writer.write({ type: "text-end", id });
    return id;
  }

  private createId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }
}
