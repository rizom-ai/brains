import {
  MessageInterfacePlugin,
  parseConfirmationResponse,
  type ChatAttachment,
  type InterfacePluginContext,
  type PendingConfirmation,
  type StructuredChatCard,
  type PermissionLookupContext,
  type RuntimeUploadStore,
  type ToolActivityEvent,
} from "@brains/plugins";
import type {
  Daemon,
  DaemonHealth,
  JobContext,
  JobProgressEvent,
  WebRouteDefinition,
} from "@brains/plugins";
import { Chat, type Message, type SentMessage, type Thread } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { chunkMessage } from "@brains/utils";
import {
  chatConfigSchema,
  type ChatConfig,
  type DiscordChatAdapterConfig,
} from "./config";
import { ThreadRegistry } from "./thread-registry";
import { createDiscordChatUploadStoreScope } from "./upload-store";
import { CHAT_PLATFORMS } from "./types";
import type {
  ChatAdapterMap,
  ChatPlatform,
  ChatWebhookMap,
  DiscordChatAdapter,
} from "./types";
import packageJson from "../package.json";

const URL_PATTERN = /https?:\/\/\S+/i;
const ANY_MESSAGE_PATTERN = /[\s\S]+/;
const PLATFORM_MESSAGE_LIMITS: Partial<Record<ChatPlatform, number>> = {
  discord: 2000,
};
const CHAT_BINARY_UPLOAD_MAX_BYTES = 5_000_000;
const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const IMAGE_EXTENSIONS = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

interface AgentInput {
  message: string;
  attachments: ChatAttachment[];
  notices: string[];
}

interface ChatSdkApp {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  webhooks?: ChatWebhookMap;
  onDirectMessage(
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
  onNewMention(
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
  onNewMessage(
    pattern: RegExp,
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
  onSubscribedMessage(
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
}

export class ChatInterface extends MessageInterfacePlugin<ChatConfig> {
  declare protected config: ChatConfig;

  private app: ChatSdkApp | undefined;
  private readonly threadRegistry = new ThreadRegistry();
  private readonly pendingConfirmations = new Map<string, Set<string>>();
  private readonly recentUploads = new Map<string, ChatAttachment[]>();
  private readonly toolActivityMessages = new Map<
    string,
    { channelId: string; messageId: string }
  >();
  private discordGatewayAdapter: DiscordChatAdapter | undefined;
  private gatewayAbortController: AbortController | undefined;
  private gatewayLoopPromise: Promise<void> | undefined;

  constructor(config: Partial<ChatConfig> = {}) {
    super("chat", packageJson, config, chatConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.app = this.createChatApp();
    this.registerChatHandlers(this.app);
  }

  override getWebRoutes(): WebRouteDefinition[] {
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
        handler: async (request: Request): Promise<Response> => {
          return this.handleDiscordUploadRequest(request);
        },
      },
    ];
  }

  private async handleDiscordUploadRequest(
    request: Request,
  ): Promise<Response> {
    const uploadId = new URL(request.url).searchParams.get("id")?.trim();
    if (!uploadId) {
      return new Response("Missing upload id", { status: 400 });
    }

    try {
      const uploadStore = this.getDiscordUploadStore();
      const { record, content } = await uploadStore.read(uploadId);
      const body = new Uint8Array(content).buffer;
      return new Response(body, {
        headers: {
          "Content-Type": record.mediaType,
          "Content-Length": String(content.byteLength),
          "Content-Disposition": `${
            new URL(request.url).searchParams.has("download")
              ? "attachment"
              : "inline"
          }; filename="${this.escapeHeaderValue(record.filename)}"`,
        },
      });
    } catch {
      return new Response("Upload not found", { status: 404 });
    }
  }

  private getDiscordUploadStore(): RuntimeUploadStore {
    if (!this.context) throw new Error("Chat interface not registered");
    return this.context.uploads.scoped(createDiscordChatUploadStoreScope());
  }

  private escapeHeaderValue(value: string): string {
    return value.replace(/["\\\r\n]/g, "_");
  }

  protected override createDaemon(): Daemon | undefined {
    if (!this.config.adapters.discord) return undefined;

    return {
      start: async (): Promise<void> => {
        await this.startGatewayLoop();
      },
      stop: async (): Promise<void> => {
        await this.stopGatewayLoop();
      },
      healthCheck: async (): Promise<DaemonHealth> => ({
        status: this.gatewayLoopPromise ? "healthy" : "error",
        message: this.gatewayLoopPromise
          ? "Chat gateway loop running"
          : "Chat gateway loop stopped",
        lastCheck: new Date(),
      }),
    };
  }

  override sendMessageToChannel({
    channelId,
    message,
  }: {
    channelId: string | null;
    message: string;
  }): void {
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return;
    for (const chunk of this.chunkForChannel(channelId, message)) {
      thread.post(chunk).catch((error: unknown) =>
        this.logger.error("Failed to send chat message", {
          error,
          channelId,
        }),
      );
    }
  }

  protected override async sendMessageWithId({
    channelId,
    message,
  }: {
    channelId: string | null;
    message: string;
  }): Promise<string | undefined> {
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return undefined;
    let lastSent: SentMessage | undefined;
    for (const chunk of this.chunkForChannel(channelId, message)) {
      lastSent = await thread.post(chunk);
      this.threadRegistry.trackMessage(thread.id, lastSent);
    }
    return lastSent?.id;
  }

  protected override async editMessage({
    channelId,
    messageId,
    newMessage,
  }: {
    channelId: string | null;
    messageId: string;
    newMessage: string;
  }): Promise<boolean> {
    const sent = this.threadRegistry.getMessage(channelId, messageId);
    if (!sent) return false;
    try {
      const edited = await sent.edit(newMessage);
      if (channelId) this.threadRegistry.trackMessage(channelId, edited);
      return true;
    } catch {
      return false;
    }
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  protected override async handleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    const interfaceType = event.metadata.interfaceType;
    if (interfaceType && interfaceType !== this.id) {
      if (!this.isEnabledPlatform(interfaceType)) return;
      const routedEvent: JobProgressEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          interfaceType: this.id,
        },
      };
      await super.handleProgressEvent(routedEvent, routedEvent.metadata);
      return;
    }

    await super.handleProgressEvent(event, context);
  }

  protected override async handleToolActivityEvent(
    event: ToolActivityEvent,
  ): Promise<void> {
    if (event.interfaceType !== this.id) {
      if (!this.isEnabledPlatform(event.interfaceType)) return;
    }
    const channelId = event.channelId;
    if (!channelId) return;

    const key = this.getToolActivityKey(event);
    const label = this.formatToolName(event.toolName);
    if (event.type === "tool:invoking") {
      const messageId = await this.sendMessageWithId({
        channelId,
        message: `⏳ **${label}** running…`,
      });
      if (messageId)
        this.toolActivityMessages.set(key, { channelId, messageId });
      return;
    }

    if (event.type === "tool:completed") {
      await this.updateToolActivityMessage(key, `✅ **${label}** completed.`);
      return;
    }

    await this.updateToolActivityMessage(
      key,
      `❌ **${label}** failed${event.error ? `: ${event.error}` : "."}`,
      channelId,
    );
  }

  private async updateToolActivityMessage(
    key: string,
    message: string,
    fallbackChannelId?: string,
  ): Promise<void> {
    const tracked = this.toolActivityMessages.get(key);
    if (tracked) {
      await this.editMessage({
        channelId: tracked.channelId,
        messageId: tracked.messageId,
        newMessage: message,
      });
      this.toolActivityMessages.delete(key);
      return;
    }
    if (fallbackChannelId) {
      this.sendMessageToChannel({ channelId: fallbackChannelId, message });
    }
  }

  private getToolActivityKey(event: ToolActivityEvent): string {
    return `${event.conversationId}:${event.toolName}`;
  }

  private formatToolName(toolName: string): string {
    return toolName.replace(/[_-]+/g, " ");
  }

  private isEnabledPlatform(interfaceType: string): boolean {
    return interfaceType === "discord" && Boolean(this.config.adapters.discord);
  }

  private chunkForChannel(channelId: string | null, message: string): string[] {
    const platform = this.parseChatPlatform(channelId);
    const limit = platform ? PLATFORM_MESSAGE_LIMITS[platform] : undefined;
    return limit ? chunkMessage(message, limit) : [message];
  }

  private parseChatPlatform(
    channelId: string | null,
  ): ChatPlatform | undefined {
    const platform = channelId?.split(":")[0];
    return CHAT_PLATFORMS.find((candidate) => candidate === platform);
  }

  private createChatApp(): ChatSdkApp {
    const discord = this.config.adapters.discord;
    if (!discord) {
      return new Chat({
        userName: this.config.userName,
        adapters: {},
        state: createMemoryState(),
      });
    }

    const discordAdapter = createDiscordAdapter({
      botToken: discord.botToken,
      publicKey: discord.publicKey,
      applicationId: discord.applicationId,
      mentionRoleIds: discord.mentionRoleIds,
    });
    this.discordGatewayAdapter = discordAdapter;

    return new Chat({
      userName: this.config.userName,
      adapters: { discord: discordAdapter } satisfies ChatAdapterMap,
      state: createMemoryState(),
    });
  }

  private registerChatHandlers(app: ChatSdkApp): void {
    app.onDirectMessage(async (thread, message) => {
      await this.handleRoutedMessage(thread, message);
    });

    app.onNewMention(async (thread, message) => {
      if (!thread.isDM && this.getPlatformConfig(thread)?.useThreads) {
        await thread.subscribe();
      }
      await this.handleRoutedMessage(thread, message);
    });

    app.onSubscribedMessage(async (thread, message) => {
      await this.handleRoutedMessage(thread, message);
    });

    if (
      this.config.adapters.discord &&
      !this.config.adapters.discord.requireMention
    ) {
      app.onNewMessage(ANY_MESSAGE_PATTERN, async (thread, message) => {
        await this.handleRoutedMessage(thread, message);
      });
    }

    app.onNewMessage(URL_PATTERN, async (thread, message) => {
      await this.handlePassiveUrlCapture(thread, message);
    });
  }

  private async handleRoutedMessage(
    thread: Thread,
    message: Message,
  ): Promise<void> {
    if (!this.context) return;
    const platform = this.getPlatform(thread);
    if (platform !== "discord") return;

    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig) return;
    if (thread.isDM && !platformConfig.allowDMs) return;
    if (message.author.isBot && !message.isMention) return;
    if (!this.isAllowedChannel(thread, platformConfig)) return;

    await this.routeToAgent(platform, thread, message);
  }

  private async routeToAgent(
    platform: string,
    thread: Thread,
    message: Message,
  ): Promise<void> {
    if (!this.context) return;

    this.threadRegistry.set(thread);
    const conversationId = this.getConversationId(platform, thread.id);
    const channelId = thread.id;
    const permissionContext = this.getPermissionContext(thread, message);
    const userPermissionLevel = this.context.permissions.getUserLevel(
      platform,
      message.author.userId,
      permissionContext,
    );
    const agentInput = await this.buildAgentInput(
      platform,
      thread,
      message,
      userPermissionLevel,
    );
    const sameTurnUploads = [...agentInput.attachments];
    await this.attachPriorUploads(
      conversationId,
      agentInput,
      userPermissionLevel,
    );
    await this.postUploadNotices(thread, agentInput.notices);
    if (!agentInput.message && agentInput.attachments.length === 0) return;

    this.startProcessingInput(channelId);
    try {
      if (this.getPlatformConfig(thread)?.showTypingIndicator) {
        await thread
          .startTyping()
          .catch((error: unknown) =>
            this.logger.debug("Typing indicator failed", { error, channelId }),
          );
      }

      const pendingApprovalIds =
        await this.getPendingApprovalIds(conversationId);
      if (pendingApprovalIds.size > 0) {
        await this.handleConfirmationResponse(
          agentInput.message,
          conversationId,
          thread,
          pendingApprovalIds,
        );
        return;
      }

      const response = await this.context.agent.chat(
        agentInput.message,
        conversationId,
        {
          userPermissionLevel,
          interfaceType: platform,
          channelId,
          channelName: this.getChannelName(thread, message),
          ...this.buildUserMessageMetadata(platform, thread, message),
          ...(agentInput.attachments.length > 0
            ? { attachments: agentInput.attachments }
            : {}),
        },
      );

      this.rememberUploadAttachments(conversationId, sameTurnUploads);

      if (
        response.pendingConfirmations &&
        response.pendingConfirmations.length > 0
      ) {
        this.pendingConfirmations.set(
          conversationId,
          new Set(
            response.pendingConfirmations.map(
              (confirmation) => confirmation.id,
            ),
          ),
        );
      }

      const messageId = await this.sendMessageWithId({
        channelId,
        message: this.formatAgentResponseText(
          response.text,
          response.cards,
          response.pendingConfirmations,
        ),
      });

      if (messageId && response.toolResults) {
        for (const toolResult of response.toolResults) {
          if (toolResult.jobId) {
            this.trackAgentResponseForJob(
              toolResult.jobId,
              messageId,
              channelId,
            );
          }
        }
      }
    } catch (error: unknown) {
      this.logger.error("Error handling chat message", { error, channelId });
      this.sendMessageToChannel({
        channelId,
        message: `**Error:** ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      this.endProcessingInput();
    }
  }

  private async getPendingApprovalIds(
    conversationId: string,
  ): Promise<Set<string>> {
    const existing = this.pendingConfirmations.get(conversationId);
    if (existing && existing.size > 0) return existing;

    const restored =
      await this.loadPendingApprovalIdsFromConversation(conversationId);
    if (restored.size > 0)
      this.pendingConfirmations.set(conversationId, restored);
    return restored;
  }

  private async loadPendingApprovalIdsFromConversation(
    conversationId: string,
  ): Promise<Set<string>> {
    const messages = await this.context?.conversations
      .getMessages(conversationId, { limit: 50 })
      .catch((error: unknown) => {
        this.logger.debug("Failed to load pending chat approvals", {
          error,
          conversationId,
        });
        return [];
      });
    const pending = new Set<string>();
    for (const message of messages ?? []) {
      const metadata = this.parseStoredMessageMetadata(message.metadata);
      const cards = metadata?.["cards"];
      if (!Array.isArray(cards)) continue;
      for (const card of cards) {
        if (!this.isRecord(card) || card["kind"] !== "tool-approval") {
          continue;
        }
        const id = card["id"];
        if (typeof id !== "string" || id.length === 0) continue;
        const state = card["state"];
        if (state === "approval-requested") {
          pending.add(id);
        } else if (typeof state === "string") {
          pending.delete(id);
        }
      }
    }
    return pending;
  }

  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    thread: Thread,
    approvalIds: Set<string>,
  ): Promise<void> {
    const parsed = this.parseConfirmationIntent(message, approvalIds);
    if (!parsed) {
      await thread.post(
        "_Please reply with **yes** to confirm or **no/cancel** to abort._",
      );
      return;
    }

    if (approvalIds.size > 1 && !parsed.approvalId) {
      await thread.post(
        `_Multiple approvals are pending; include one approval id with **yes** or **no/cancel**: ${[
          ...approvalIds,
        ].join(", ")}._`,
      );
      return;
    }

    const approvalId = parsed.approvalId ?? [...approvalIds][0];
    if (!approvalId) {
      this.pendingConfirmations.delete(conversationId);
      await thread.post("_No pending approval to resolve._");
      return;
    }

    this.removePendingApproval(conversationId, approvalId);
    const response = await this.context?.agent.confirmPendingAction(
      conversationId,
      parsed.confirmed,
      approvalId,
    );
    if (response) {
      await thread.post(
        this.formatAgentResponseText(
          response.text,
          response.cards,
          response.pendingConfirmations,
        ),
      );
    }
  }

  private parseConfirmationIntent(
    message: string,
    approvalIds: Set<string> | undefined,
  ): { confirmed: boolean; approvalId?: string | undefined } | undefined {
    const direct = parseConfirmationResponse(message);
    const approvalId = this.extractApprovalId(message, approvalIds);
    if (direct) return { ...direct, ...(approvalId ? { approvalId } : {}) };

    const tokenConfirmation = message
      .split(/\s+/)
      .map((token) => parseConfirmationResponse(token))
      .find((parsed) => parsed !== undefined);
    if (!tokenConfirmation) return undefined;
    return {
      ...tokenConfirmation,
      ...(approvalId ? { approvalId } : {}),
    };
  }

  private extractApprovalId(
    message: string,
    approvalIds: Set<string> | undefined,
  ): string | undefined {
    if (!approvalIds || approvalIds.size === 0) return undefined;
    const normalized = message.toLowerCase();
    return [...approvalIds].find((approvalId) =>
      normalized.includes(approvalId.toLowerCase()),
    );
  }

  private formatAgentResponseText(
    text: string,
    cards: StructuredChatCard[] | undefined,
    pendingConfirmations?: PendingConfirmation[],
  ): string {
    const cardSummaries = (cards ?? []).map((card) =>
      this.formatStructuredCard(card),
    );
    const pendingHelp =
      this.formatPendingConfirmationHelp(pendingConfirmations);
    return [text, ...cardSummaries, pendingHelp]
      .filter((part): part is string => Boolean(part?.trim()))
      .join("\n\n");
  }

  private formatPendingConfirmationHelp(
    pendingConfirmations: PendingConfirmation[] | undefined,
  ): string | undefined {
    if (!pendingConfirmations || pendingConfirmations.length === 0) {
      return undefined;
    }
    if (pendingConfirmations.length === 1) {
      const confirmation = pendingConfirmations[0];
      if (!confirmation) return undefined;
      return [
        `**Pending approval:** ${confirmation.summary}`,
        `Approval id: \`${confirmation.id}\``,
        "Reply with **yes** to confirm or **no/cancel** to abort.",
      ].join("\n");
    }

    return [
      "**Pending approvals:**",
      ...pendingConfirmations.map(
        (confirmation) => `- \`${confirmation.id}\` — ${confirmation.summary}`,
      ),
      "Reply with **yes <approval-id>** to confirm one item, or **no <approval-id>** to abort it.",
    ].join("\n");
  }

  private formatStructuredCard(card: StructuredChatCard): string {
    if (card.kind === "attachment") {
      const lines = [`**Artifact:** ${card.title}`];
      if (card.description) lines.push(card.description);
      if (card.attachment.filename) {
        lines.push(`File: ${card.attachment.filename}`);
      }
      lines.push(`Type: ${card.attachment.mediaType}`);
      lines.push(`Open: ${card.attachment.url}`);
      if (card.attachment.downloadUrl) {
        lines.push(`Download: ${card.attachment.downloadUrl}`);
      }
      return lines.join("\n");
    }

    const lines = [`**Approval:** ${card.summary || card.toolName}`];
    lines.push(`Status: ${card.state}`);
    if (card.preview) lines.push(card.preview);
    const output = this.formatCardOutput(card.output);
    if (output) lines.push(`Result: ${output}`);
    if (card.error) lines.push(`Error: ${card.error}`);
    return lines.join("\n");
  }

  private formatCardOutput(output: unknown): string | undefined {
    if (typeof output === "string") return output;
    if (typeof output === "number" || typeof output === "boolean") {
      return String(output);
    }
    return undefined;
  }

  private removePendingApproval(
    conversationId: string,
    approvalId: string,
  ): void {
    const approvalIds = this.pendingConfirmations.get(conversationId);
    if (!approvalIds) return;
    approvalIds.delete(approvalId);
    if (approvalIds.size === 0) {
      this.pendingConfirmations.delete(conversationId);
    }
  }

  private async handlePassiveUrlCapture(
    thread: Thread,
    message: Message,
  ): Promise<void> {
    const platform = this.getPlatform(thread);
    if (platform !== "discord") return;
    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig?.captureUrls) return;
    if (!platformConfig.requireMention) return;
    if (!this.isAllowedChannel(thread, platformConfig)) return;
    if (message.author.isBot) return;
    if (message.isMention) return;

    const urls = this.extractCaptureableUrls(
      message.text,
      platformConfig.blockedUrlDomains,
    );
    if (urls.length === 0) return;

    this.threadRegistry.set(thread);
    const permissionContext = this.getPermissionContext(thread, message);
    for (const url of urls) {
      await this.captureUrlViaAgent(
        url,
        thread.id,
        message.author.userId,
        platform,
        permissionContext,
      ).catch((error: unknown) =>
        this.logger.error("URL capture failed", { error, url }),
      );
    }
  }

  private async buildAgentInput(
    platform: string,
    thread: Thread,
    message: Message,
    userLevel: string,
  ): Promise<AgentInput> {
    const agentInput: AgentInput = {
      message: message.text.trim(),
      attachments: [],
      notices: [],
    };
    if (message.attachments.length === 0) return agentInput;
    if (!this.context) return agentInput;

    const canUpload = userLevel === "anchor" || userLevel === "trusted";
    if (!canUpload) return agentInput;

    const uploadStore = this.context.uploads.scoped(
      createDiscordChatUploadStoreScope(),
    );
    for (const attachment of message.attachments) {
      const attachmentName = attachment.name;
      if (!attachmentName) continue;
      const filename = this.sanitizeUploadFilename(attachmentName);
      const mediaType = this.normalizeAttachmentMediaType(
        filename,
        attachment.mimeType,
      );
      const declaredSize = attachment.size ?? 0;
      const uploadKind = this.getUploadKind(filename, mediaType);
      if (!uploadKind) {
        agentInput.notices.push(`Unsupported file upload type: ${filename}`);
        continue;
      }
      if (!this.isDeclaredSizeAllowed(uploadKind, declaredSize)) {
        agentInput.notices.push(`File upload too large: ${filename}`);
        continue;
      }

      try {
        const contentBuffer = attachment.fetchData
          ? await attachment.fetchData()
          : undefined;
        if (!contentBuffer) continue;
        const content = Buffer.from(contentBuffer);
        const validationNotice = this.getUploadContentValidationNotice(
          filename,
          uploadKind,
          content,
        );
        if (validationNotice) {
          agentInput.notices.push(validationNotice);
          continue;
        }
        const chatAttachment = await this.createChatAttachmentFromUpload({
          uploadStore,
          filename,
          mediaType,
          content,
          uploadKind,
          metadata: this.buildUploadMetadata(platform, thread, message),
        });
        agentInput.attachments.push(chatAttachment);
      } catch (error: unknown) {
        this.logger.error("Failed to read chat attachment", {
          error,
          filename,
        });
        agentInput.notices.push(`Could not read file upload: ${filename}`);
      }
    }

    return agentInput;
  }

  private async createChatAttachmentFromUpload(input: {
    uploadStore: RuntimeUploadStore;
    filename: string;
    mediaType: string;
    content: Buffer;
    uploadKind: "text" | "file";
    metadata: Record<string, unknown>;
  }): Promise<ChatAttachment> {
    const record = await input.uploadStore.save({
      filename: input.filename,
      mediaType: input.mediaType,
      content: input.content,
      metadata: input.metadata,
    });
    const source = record.ref;
    if (input.uploadKind === "text") {
      return {
        kind: "text",
        filename: record.filename,
        mediaType: record.mediaType,
        content: input.content.toString("utf8").replace(/^\uFEFF/, ""),
        sizeBytes: input.content.byteLength,
        source,
      };
    }

    return {
      kind: "file",
      filename: record.filename,
      mediaType: record.mediaType,
      data: input.content,
      sizeBytes: input.content.byteLength,
      source,
    };
  }

  private buildUploadMetadata(
    platform: string,
    thread: Thread,
    message: Message,
  ): Record<string, unknown> {
    const ids = this.getThreadIdParts(thread.id);
    return {
      interfaceType: platform,
      channelId: thread.id,
      parentChannelId: thread.channelId,
      messageId: message.id,
      uploaderId: message.author.userId,
      uploaderUsername: message.author.userName,
      ...(ids.guildId ? { guildId: ids.guildId } : {}),
      ...(ids.threadId ? { threadId: ids.threadId } : {}),
    };
  }

  private async postUploadNotices(
    thread: Thread,
    notices: string[],
  ): Promise<void> {
    const uniqueNotices = [...new Set(notices)];
    if (uniqueNotices.length === 0) return;
    await thread.post(
      [
        "Some uploads were skipped:",
        ...uniqueNotices.map((notice) => `- ${notice}`),
      ].join("\n"),
    );
  }

  private getUploadContentValidationNotice(
    filename: string,
    uploadKind: "text" | "file",
    content: Buffer,
  ): string | undefined {
    if (uploadKind === "text") {
      if (!this.isFileSizeAllowed(content.byteLength)) {
        return `File upload too large: ${filename}`;
      }
      if (!this.isLikelyUtf8Text(content)) {
        return `Unsupported file upload type: ${filename}`;
      }
      return undefined;
    }
    if (content.byteLength > CHAT_BINARY_UPLOAD_MAX_BYTES) {
      return `File upload too large: ${filename}`;
    }
    return undefined;
  }

  private sanitizeUploadFilename(filename: string): string {
    const leaf = filename.split(/[\\/]/).at(-1)?.trim() ?? "";
    const cleaned = Array.from(leaf)
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && code !== 127;
      })
      .join("")
      .slice(0, 160);
    return cleaned.length > 0 ? cleaned : "upload";
  }

  private async attachPriorUploads(
    conversationId: string,
    agentInput: AgentInput,
    userLevel: string,
  ): Promise<void> {
    if (agentInput.attachments.length > 0) return;
    if (userLevel !== "anchor" && userLevel !== "trusted") return;
    const uploads = await this.getRecentUploads(conversationId);
    if (uploads.length === 0) return;
    agentInput.attachments = this.selectPriorUploads(
      agentInput.message,
      uploads,
    );
  }

  private rememberUploadAttachments(
    conversationId: string,
    attachments: ChatAttachment[],
  ): void {
    if (attachments.length === 0) return;
    const existing = this.recentUploads.get(conversationId) ?? [];
    this.recentUploads.set(
      conversationId,
      [...existing, ...attachments].slice(-20),
    );
  }

  private async getRecentUploads(
    conversationId: string,
  ): Promise<ChatAttachment[]> {
    const existing = this.recentUploads.get(conversationId) ?? [];
    if (existing.length > 0) return existing;
    if (!this.context) return [];

    const uploadStore = this.context.uploads.scoped(
      createDiscordChatUploadStoreScope(),
    );
    const restored = await this.loadRecentUploadsFromConversation(
      conversationId,
      uploadStore,
    );
    if (restored.length > 0) {
      this.recentUploads.set(conversationId, restored.slice(-20));
    }
    return restored;
  }

  private async loadRecentUploadsFromConversation(
    conversationId: string,
    uploadStore: RuntimeUploadStore,
  ): Promise<ChatAttachment[]> {
    const messages = await this.context?.conversations
      .getMessages(conversationId, { limit: 50 })
      .catch((error: unknown) => {
        this.logger.debug("Failed to load prior chat uploads", {
          error,
          conversationId,
        });
        return [];
      });
    const uploadIds = this.collectStoredUploadIds(messages ?? []);
    const uploads: ChatAttachment[] = [];
    for (const uploadId of uploadIds) {
      try {
        const resolved = await uploadStore.read(uploadId);
        uploads.push(
          this.createChatAttachmentFromStoredUpload(
            resolved.record.filename,
            resolved.record.mediaType,
            resolved.content,
            resolved.record.ref,
          ),
        );
      } catch (error: unknown) {
        this.logger.debug("Failed to restore prior chat upload", {
          error,
          uploadId,
        });
      }
    }
    return uploads;
  }

  private collectStoredUploadIds(messages: unknown[]): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const message of messages) {
      if (!this.isRecord(message)) continue;
      if (message["role"] !== "user") continue;
      const metadata = this.parseStoredMessageMetadata(message["metadata"]);
      const attachments = metadata?.["attachments"];
      if (!Array.isArray(attachments)) continue;
      for (const attachment of attachments) {
        if (!this.isRecord(attachment)) continue;
        const source = attachment["source"];
        if (!this.isRecord(source)) continue;
        if (source["kind"] !== "discord-chat-upload") continue;
        const id = source["id"];
        if (typeof id !== "string" || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  }

  private createChatAttachmentFromStoredUpload(
    filename: string,
    mediaType: string,
    content: Buffer,
    source: { kind: string; id: string },
  ): ChatAttachment {
    if (this.isUploadableTextFile(filename, mediaType)) {
      return {
        kind: "text",
        filename,
        mediaType,
        content: content.toString("utf8").replace(/^\uFEFF/, ""),
        sizeBytes: content.byteLength,
        source,
      };
    }
    return {
      kind: "file",
      filename,
      mediaType,
      data: content,
      sizeBytes: content.byteLength,
      source,
    };
  }

  private parseStoredMessageMetadata(
    metadata: unknown,
  ): Record<string, unknown> | null {
    if (typeof metadata === "string") {
      try {
        const parsed = JSON.parse(metadata) as unknown;
        return this.isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return this.isRecord(metadata) ? metadata : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private selectPriorUploads(
    message: string,
    uploads: ChatAttachment[],
  ): ChatAttachment[] {
    const normalized = message.toLowerCase();
    const named = uploads.filter((upload) =>
      normalized.includes(upload.filename.toLowerCase()),
    );
    if (named.length > 0) return named;
    if (/\b(first|oldest|earliest)\b/.test(normalized)) {
      return uploads.slice(0, 1);
    }
    if (/\b(latest|newest|most recent|last)\b/.test(normalized)) {
      return uploads.slice(-1);
    }
    return uploads;
  }

  private getUploadKind(
    filename: string,
    mediaType: string,
  ): "text" | "file" | undefined {
    if (this.isUploadableTextFile(filename, mediaType)) return "text";
    if (this.isUploadableBinaryFile(filename, mediaType)) return "file";
    return undefined;
  }

  private isDeclaredSizeAllowed(
    uploadKind: "text" | "file",
    sizeBytes: number,
  ): boolean {
    if (sizeBytes <= 0) return true;
    return uploadKind === "text"
      ? this.isFileSizeAllowed(sizeBytes)
      : sizeBytes <= CHAT_BINARY_UPLOAD_MAX_BYTES;
  }

  private normalizeAttachmentMediaType(
    filename: string,
    mediaType: string | undefined,
  ): string {
    const trimmed = mediaType?.trim().split(";", 1)[0]?.toLowerCase() ?? "";
    if (trimmed && trimmed !== "application/octet-stream") return trimmed;
    const lowerFilename = filename.toLowerCase();
    for (const [extension, extensionMediaType] of IMAGE_EXTENSIONS) {
      if (lowerFilename.endsWith(extension)) return extensionMediaType;
    }
    if (lowerFilename.endsWith(".pdf")) return "application/pdf";
    return trimmed || "application/octet-stream";
  }

  private isUploadableBinaryFile(filename: string, mediaType: string): boolean {
    if (IMAGE_MIME_TYPES.has(mediaType)) return true;
    if (mediaType === "application/pdf") return true;
    const lowerFilename = filename.toLowerCase();
    return (
      lowerFilename.endsWith(".pdf") ||
      [...IMAGE_EXTENSIONS.keys()].some((extension) =>
        lowerFilename.endsWith(extension),
      )
    );
  }

  private isLikelyUtf8Text(bytes: Uint8Array): boolean {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }

  private getPlatform(thread: Thread): string {
    return thread.adapter.name;
  }

  private getPlatformConfig(
    thread: Thread,
  ): DiscordChatAdapterConfig | undefined {
    const platform = this.getPlatform(thread);
    if (platform === "discord") return this.config.adapters.discord;
    return undefined;
  }

  private getConversationId(platform: string, threadId: string): string {
    return `${platform}-${threadId}`;
  }

  private isAllowedChannel(
    thread: Thread,
    config: DiscordChatAdapterConfig,
  ): boolean {
    if (config.allowedChannels.length === 0 || thread.isDM) return true;
    const ids = this.getThreadIdParts(thread.id);
    return [thread.id, thread.channelId, ids.channelId, ids.threadId].some(
      (id) => typeof id === "string" && config.allowedChannels.includes(id),
    );
  }

  private getPermissionContext(
    thread: Thread,
    message: Message,
  ): PermissionLookupContext {
    const ids = this.getThreadIdParts(thread.id);
    return {
      channelId: ids.channelId ?? thread.channelId,
      isBot: Boolean(message.author.isBot),
    };
  }

  private getChannelName(thread: Thread, _message: Message): string {
    return thread.isDM ? "DM" : thread.channelId;
  }

  private buildUserMessageMetadata(
    platform: string,
    thread: Thread,
    message: Message,
  ): Record<string, unknown> {
    const ids = this.getThreadIdParts(thread.id);
    return {
      actor: {
        actorId: `${platform}:${message.author.userId}`,
        interfaceType: platform,
        role: "user",
        displayName: message.author.fullName || message.author.userName,
        username: message.author.userName,
        isBot: Boolean(message.author.isBot),
      },
      source: {
        messageId: message.id,
        channelId: thread.id,
        channelName: this.getChannelName(thread, message),
        ...(ids.threadId ? { threadId: ids.threadId } : {}),
        metadata: {
          ...(ids.guildId ? { guildId: ids.guildId } : {}),
        },
      },
    };
  }

  private getThreadIdParts(threadId: string): {
    guildId?: string;
    channelId?: string;
    threadId?: string;
  } {
    const parts = threadId.split(":");
    if (parts[0] !== "discord") return {};
    return {
      ...(parts[1] ? { guildId: parts[1] } : {}),
      ...(parts[2] ? { channelId: parts[2] } : {}),
      ...(parts[3] ? { threadId: parts[3] } : {}),
    };
  }

  private async startGatewayLoop(): Promise<void> {
    if (this.gatewayLoopPromise) return;
    if (!this.app) throw new Error("Chat SDK app not initialized");

    this.gatewayAbortController = new AbortController();
    await this.app.initialize();
    this.gatewayLoopPromise = this.runGatewayLoop(
      this.gatewayAbortController.signal,
    );
  }

  private async stopGatewayLoop(): Promise<void> {
    this.gatewayAbortController?.abort();
    await this.gatewayLoopPromise?.catch((error: unknown) =>
      this.logger.debug("Chat gateway loop stopped with error", { error }),
    );
    this.gatewayLoopPromise = undefined;
    this.gatewayAbortController = undefined;
    this.threadRegistry.clear();
    this.recentUploads.clear();
    this.toolActivityMessages.clear();
    await this.app?.shutdown();
  }

  private async runGatewayLoop(signal: AbortSignal): Promise<void> {
    if (!this.app) return;
    const adapter = this.discordGatewayAdapter;
    if (!adapter) return;
    while (!this.isAborted(signal)) {
      const tasks: Promise<unknown>[] = [];
      try {
        await adapter.startGatewayListener(
          { waitUntil: (task): void => void tasks.push(task) },
          this.config.gatewayRunMs,
          signal,
        );
        await Promise.allSettled(tasks);
      } catch (error: unknown) {
        if (this.isAborted(signal)) return;
        this.logger.error("Discord gateway listener failed", { error });
      }

      if (this.isAborted(signal)) return;
      await this.delay(this.config.gatewayRestartDelayMs, signal);
    }
  }

  private isAborted(signal: AbortSignal): boolean {
    return signal.aborted;
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
}
