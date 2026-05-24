import { getActiveAuthService } from "@brains/auth-service";
import {
  MessageInterfacePlugin,
  type EditMessageRequest,
  type InterfacePluginContext,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  type WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { join } from "path";
import packageJson from "../package.json";
import { webChatConfigSchema, type WebChatConfig } from "./config";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const uiMessageSchema = z.object({
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
});

const chatRequestSchema = z.object({
  id: z.string().optional(),
  messages: z.array(uiMessageSchema).min(1),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;

const uiAssetPath = "/chat/assets/app.js";
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "app.js");

interface ActiveStream {
  writer: UIMessageStreamWriter<UIMessage>;
}

export class WebChatInterface extends MessageInterfacePlugin<WebChatConfig> {
  declare protected config: WebChatConfig;
  private readonly activeStreams = new Map<string, ActiveStream>();

  constructor(config: Partial<WebChatConfig> = {}) {
    super("web-chat", packageJson, config, webChatConfigSchema);
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
        path: uiAssetPath,
        method: "GET",
        public: true,
        handler: (): Promise<Response> => this.handleUiAssetRequest(),
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

  private async handleChatPage(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

    return new Response(this.renderChatPage(), {
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

  private async handleChatRequest(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("Invalid chat request", { status: 400 });
    }

    const message = this.extractLastUserText(parsed.data);
    if (!message) {
      return new Response("No user message found", { status: 400 });
    }

    const conversationId = parsed.data.id ?? this.createId("web");
    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        await this.handleStreamedChat({ writer, conversationId, message });
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  private async handleStreamedChat(input: {
    writer: UIMessageStreamWriter<UIMessage>;
    conversationId: string;
    message: string;
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
          userPermissionLevel: "anchor",
          interfaceType: "web-chat",
          channelId: input.conversationId,
          channelName: "Web Chat",
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
      if (response.pendingConfirmation) {
        input.writer.write({
          type: "data-confirmation",
          id: this.createId("confirmation"),
          data: response.pendingConfirmation,
        });
      }
    } finally {
      this.endProcessingInput();
      this.activeStreams.delete(input.conversationId);
    }
  }

  private getActiveStream(channelId: string | null): ActiveStream | undefined {
    if (!channelId) return undefined;
    return this.activeStreams.get(channelId);
  }

  private async isAuthorized(request: Request): Promise<boolean> {
    const authService = getActiveAuthService();
    if (!authService) return true;
    const session = await authService.getOperatorSession(request);
    return session !== undefined;
  }

  private extractLastUserText(request: ChatRequest): string {
    const lastUserMessage = this.findLastUserMessage(request);
    if (!lastUserMessage) return "";
    if (lastUserMessage.content) return lastUserMessage.content;

    return (lastUserMessage.parts ?? [])
      .map((part) => {
        const parsed = textPartSchema.safeParse(part);
        return parsed.success ? parsed.data.text : "";
      })
      .filter((part) => part.length > 0)
      .join("\n");
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

  private renderChatPage(): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Brain Chat</title></head><body><main id="root" data-web-chat-root>Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
