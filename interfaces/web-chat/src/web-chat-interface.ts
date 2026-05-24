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

const confirmationRequestSchema = z.object({
  id: z.string(),
  confirmed: z.boolean(),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;

const uiAssetPath = "/chat/assets/app.js";
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "app.js");
const chatPageStyles = `
:root {
  --chat-bg: var(--dashboard-bg, var(--color-bg, #0a0819));
  --chat-card: var(--dashboard-card, var(--color-bg-card, #14112b));
  --chat-card-soft: var(--dashboard-card-soft, var(--color-bg-subtle, #1b1638));
  --chat-text: var(--dashboard-text, var(--color-text, #f1eadd));
  --chat-text-dim: var(--dashboard-text-dim, var(--color-text-muted, #bfb7a6));
  --chat-border: var(--rule-strong, color-mix(in srgb, var(--chat-text) 14%, transparent));
  --chat-accent: var(--dashboard-accent, var(--color-accent, #ff8b3d));
  --chat-accent-soft: var(--accent-soft, color-mix(in srgb, var(--chat-accent) 12%, transparent));
  --chat-error: var(--dashboard-error, var(--color-error, #e26d6d));
  --chat-font-display: var(--dashboard-font-display, var(--font-display, serif));
  --chat-font-body: var(--dashboard-font-body, var(--font-body, system-ui, sans-serif));
  --chat-font-mono: var(--dashboard-font-mono, var(--font-label, ui-monospace, monospace));
  color-scheme: dark;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--chat-bg);
  color: var(--chat-text);
  font-family: var(--chat-font-body);
}
button, textarea { font: inherit; }
.web-chat-app {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 1rem;
  width: min(960px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1.25rem;
}
.web-chat-header h1 {
  margin: 0;
  font-family: var(--chat-font-display);
  font-size: clamp(1.75rem, 4vw, 3rem);
  letter-spacing: -0.04em;
}
.web-chat-version, .web-chat-status { color: var(--chat-text-dim); }
.web-chat-conversation {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--chat-border);
  border-radius: 1.5rem;
  background: var(--chat-card);
}
.web-chat-conversation-content { display: flex; flex-direction: column; gap: 1rem; min-height: 100%; padding: 1rem; }
.web-chat-empty-state { margin: auto; max-width: 32rem; padding: 3rem 1rem; text-align: center; color: var(--chat-text-dim); }
.web-chat-message { max-width: min(42rem, 92%); border: 1px solid var(--chat-border); border-radius: 1rem; padding: 0.9rem 1rem; background: var(--chat-card-soft); }
.web-chat-message[data-role="user"] { align-self: flex-end; background: var(--chat-accent-soft); border-color: var(--chat-accent); }
.web-chat-message[data-role="assistant"] { align-self: flex-start; }
.web-chat-message-content > strong { display: block; margin-bottom: 0.55rem; color: var(--chat-accent); font-family: var(--chat-font-mono); font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
.web-chat-message-response { margin: 0 0 0.75rem; line-height: 1.6; }
.web-chat-message-response:last-child { margin-bottom: 0; }
.web-chat-code-block, .web-chat-data-part, .web-chat-confirmation { margin-top: 0.85rem; overflow: hidden; border: 1px solid var(--chat-border); border-radius: 0.85rem; background: var(--chat-bg); }
.web-chat-code-block figcaption { padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--chat-border); color: var(--chat-text-dim); font-family: var(--chat-font-mono); font-size: 0.75rem; }
.web-chat-code-block pre, .web-chat-data-part pre { overflow: auto; margin: 0; padding: 0.85rem; font-family: var(--chat-font-mono); line-height: 1.5; }
.web-chat-data-part, .web-chat-confirmation { padding: 0.85rem; }
.web-chat-data-part summary { cursor: pointer; font-weight: 600; }
.web-chat-confirmation-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.85rem; }
.web-chat-confirmation-actions button { border: 1px solid var(--chat-border); border-radius: 999px; padding: 0.45rem 0.85rem; background: var(--chat-card-soft); color: var(--chat-text); cursor: pointer; font-weight: 700; }
.web-chat-confirmation-actions button:first-child { background: var(--chat-accent); color: var(--chat-bg); }
.web-chat-confirmation-actions button:disabled { cursor: not-allowed; opacity: 0.58; }
.web-chat-confirmation-result { color: var(--chat-text-dim); }
.web-chat-error { color: var(--chat-error); }
.web-chat-prompt-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.75rem; align-items: end; border: 1px solid var(--chat-border); border-radius: 1.25rem; padding: 0.75rem; background: var(--chat-card); }
.web-chat-prompt-input label { grid-column: 1 / -1; color: var(--chat-text-dim); font-size: 0.8rem; }
.web-chat-prompt-textarea { min-height: 4.5rem; max-height: 14rem; resize: vertical; border: 1px solid var(--chat-border); border-radius: 0.9rem; padding: 0.75rem; background: var(--chat-bg); color: inherit; }
.web-chat-prompt-submit { min-height: 2.75rem; border: 0; border-radius: 999px; padding: 0 1.15rem; background: var(--chat-accent); color: var(--chat-bg); cursor: pointer; font-weight: 700; }
.web-chat-prompt-submit:disabled { cursor: not-allowed; opacity: 0.58; }
@media (max-width: 640px) { .web-chat-app { padding: 0.75rem; } .web-chat-prompt-input { grid-template-columns: 1fr; } }
`;

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
        path: "/api/chat/confirm",
        method: "POST",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleConfirmationRequest(request),
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

  private async handleConfirmationRequest(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

    const parsed = confirmationRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("Invalid confirmation request", { status: 400 });
    }

    const response = await this.getContext().agent.confirmPendingAction(
      parsed.data.id,
      parsed.data.confirmed,
    );

    return Response.json({
      text: response.text,
      toolResults: response.toolResults ?? [],
      pendingConfirmation: response.pendingConfirmation ?? null,
    });
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
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Brain Chat</title><style data-web-chat-styles>${chatPageStyles}</style></head><body><main id="root" data-web-chat-root>Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
