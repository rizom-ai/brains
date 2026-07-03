import {
  formatContentDispositionHeader,
  type IRuntimeStateNamespace,
  type RuntimeUploadStore,
  type WebRouteDefinition,
} from "@brains/plugins";
import type {
  ActionEvent,
  Channel,
  Message,
  MessageContext,
  Thread,
} from "chat";
import type { ChatWebhookMap } from "./types";
import type { DiscordChatAdapterConfig } from "./config";

/**
 * The slice of the Chat SDK app the interface drives. Handler registration
 * (the turn-routing binding) stays with the interface; this owns the HTTP
 * surface (webhook + upload routes) and initialize/shutdown.
 *
 * Type-only "chat" imports here — this module pulls in no SDK at runtime, so it
 * (and its unit test) stay free of Chat SDK module mocks. Construction lives in
 * `createDiscordChatSdkApp`, injected via `buildApp`.
 */
export interface ChatSdkApp {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  webhooks?: ChatWebhookMap;
  onDirectMessage(
    handler: (
      thread: Thread,
      message: Message,
      channel: Channel,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onNewMention(
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onNewMessage(
    pattern: RegExp,
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onSubscribedMessage(
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onAction(
    actionIds: string[] | string,
    handler: (event: ActionEvent) => Promise<void>,
  ): void;
}

interface DiscordChatAppDeps {
  /** Whether Discord is configured — gates the upload route. */
  discord: DiscordChatAdapterConfig | undefined;
  /** Lazy: the runtime upload store is only available once the plugin is registered. */
  getUploadStore: () => RuntimeUploadStore | undefined;
  /** Construct the Chat SDK app (see createDiscordChatSdkApp); injected so this stays SDK-free. */
  buildApp: (runtimeState: IRuntimeStateNamespace) => ChatSdkApp;
}

/**
 * Owns the Discord-backed Chat SDK app lifecycle and HTTP surface, keeping the
 * SDK plumbing out of ChatInterface. The interface still registers its turn
 * handlers against the built app (see `instance`) — that binding is interface
 * logic, not SDK lifecycle.
 */
export class DiscordChatApp {
  private readonly deps: DiscordChatAppDeps;
  private app: ChatSdkApp | undefined;

  constructor(deps: DiscordChatAppDeps) {
    this.deps = deps;
  }

  /** Construct the Chat SDK app. Returns it so the interface can register handlers. */
  build(runtimeState: IRuntimeStateNamespace): ChatSdkApp {
    this.app = this.deps.buildApp(runtimeState);
    return this.app;
  }

  /** The built app, for handler registration by the interface. Undefined before build(). */
  get instance(): ChatSdkApp | undefined {
    return this.app;
  }

  async initialize(): Promise<void> {
    if (!this.app) throw new Error("Chat SDK app not initialized");
    await this.app.initialize();
  }

  async shutdown(): Promise<void> {
    await this.app?.shutdown();
  }

  getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: "/api/webhooks/chat/discord",
        method: "POST",
        public: true,
        handler: async (request: Request): Promise<Response> => {
          if (!this.app?.webhooks?.discord) {
            return new Response("Discord chat webhook not configured", {
              status: 404,
            });
          }
          return this.app.webhooks.discord(request);
        },
      },
      {
        path: "/api/webhooks/chat/discord/uploads",
        method: "GET",
        public: true,
        handler: async (request: Request): Promise<Response> =>
          this.handleUploadRequest(request),
      },
    ];
  }

  private async handleUploadRequest(request: Request): Promise<Response> {
    if (!this.deps.discord) {
      return new Response("Discord chat uploads not configured", {
        status: 404,
      });
    }

    const uploadId = new URL(request.url).searchParams.get("id")?.trim();
    if (!uploadId) {
      return new Response("Missing upload id", { status: 400 });
    }

    try {
      const uploadStore = this.deps.getUploadStore();
      if (!uploadStore) throw new Error("Chat upload store unavailable");
      const { record, content } = await uploadStore.read(uploadId);
      const body = new Uint8Array(content).buffer;
      return new Response(body, {
        headers: {
          "Content-Type": record.mediaType,
          "Content-Length": String(content.byteLength),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": formatContentDispositionHeader({
            disposition: new URL(request.url).searchParams.has("download")
              ? "attachment"
              : "inline",
            filename: record.filename,
          }),
        },
      });
    } catch {
      return new Response("Upload not found", { status: 404 });
    }
  }
}
