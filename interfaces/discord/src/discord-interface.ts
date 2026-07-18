import { getActiveAuthService, type AuthPrincipal } from "@brains/auth-service";
import { createExternalActorId } from "@brains/contracts";
import {
  MessageInterfacePlugin,
  buildApprovalResultView,
  formatApprovalRequestText,
  getPendingApprovalCards,
  getResolvedApprovalCard,
  parseConfirmationResponse,
  matchSpaceSelector,
  type AgentResponse,
  type ApprovalResolution,
  type ChatContext,
  type InterfacePluginContext,
  type PermissionLookupContext,
  type ToolApprovalCard,
  type UserPermissionLevel,
} from "@brains/plugins";
import type { Daemon } from "@brains/plugins";
import { chunkMessage } from "@brains/utils/chunk-message";
import { fetchAsText } from "@brains/utils/http-utils";
import { truncateText } from "@brains/utils/string-utils";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type ButtonInteraction,
  type Interaction,
  type Message,
} from "discord.js";
import { discordConfigSchema } from "./config";
import type { DiscordConfig, DiscordConstructorConfig } from "./config";
import packageJson from "../package.json";

const DISCORD_MAX_LENGTH = 2000;
const APPROVAL_RESULT_TITLES: Record<ApprovalResolution, string> = {
  completed: "Action completed",
  declined: "Action declined",
  failed: "Action failed",
};
const APPROVAL_RESULT_COLORS: Record<ApprovalResolution, number> = {
  completed: 0x22c55e,
  declined: 0x94a3b8,
  failed: 0xef4444,
};
const DISCORD_NATIVE_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const TYPING_REFRESH_MS = 8000;
const THREAD_NAME_MAX_LENGTH = 100;

interface DiscordSendOptions {
  content: string;
  embeds?: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
  files?: Array<Record<string, unknown>>;
}

type DiscordSendPayload = string | DiscordSendOptions;

interface SentDiscordMessage {
  id: string;
  edit(content: string): Promise<unknown>;
}

/** Type guard for channels that support send/typing */
interface SendableChannel {
  id: string;
  send(content: DiscordSendPayload): Promise<SentDiscordMessage>;
  sendTyping(): Promise<void>;
  isThread(): boolean;
  messages: {
    fetch(id: string): Promise<SentDiscordMessage>;
  };
}

function isSendable(channel: unknown): channel is SendableChannel {
  return (
    !!channel &&
    typeof channel === "object" &&
    "send" in channel &&
    "sendTyping" in channel
  );
}

export interface DiscordDeps {
  fetchText?: (url: string) => Promise<string>;
}

/**
 * Discord Interface - Agent-based architecture
 *
 * Routes all messages to AgentService, supports threads, file uploads,
 * and message chunking for Discord's 2000 char limit.
 */
export class DiscordInterface extends MessageInterfacePlugin<
  DiscordConfig,
  DiscordConstructorConfig
> {
  declare protected config: DiscordConfig;
  private client: Client | null = null;
  private readonly fetchText: (url: string) => Promise<string>;

  private pendingConfirmations = new Map<string, Set<string>>();
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly eventHandlerController = new AbortController();
  private readonly activeEventHandlers = new Set<Promise<void>>();
  private eventHandlerStopPromise: Promise<void> | null = null;
  private eventHandlersClosed = false;

  constructor(config: DiscordConstructorConfig, deps: DiscordDeps = {}) {
    super("discord", packageJson, config, discordConfigSchema);
    this.fetchText = deps.fetchText ?? fetchAsText;
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Create Discord client during registration (not daemon start)
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    // Set up event handlers
    this.client.on(Events.MessageCreate, (message: Message) => {
      this.runEventHandler("message", (signal) =>
        this.handleMessage(message, signal),
      );
    });

    this.client.on(Events.InteractionCreate, (interaction: Interaction) => {
      this.runEventHandler("interaction", (signal) =>
        this.handleInteraction(interaction, signal),
      );
    });

    this.client.once(Events.ClientReady, () => {
      this.logger.info("Discord bot connected", {
        tag: this.client?.user?.tag,
      });
    });
  }

  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        if (!this.client) {
          throw new Error("Discord client not initialized");
        }
        await this.client.login(this.config.botToken);
      },
      stop: (): Promise<void> => this.stopEventHandlers(),
      healthCheck: async () => ({
        status: this.client?.user ? "healthy" : "error",
        message: this.client?.user
          ? `Connected as ${this.client.user.tag}`
          : "Not connected",
        lastCheck: new Date(),
      }),
    };
  }

  private runEventHandler(
    kind: "message" | "interaction",
    operation: (signal: AbortSignal) => Promise<void>,
  ): void {
    if (this.eventHandlersClosed) return;
    const signal = this.eventHandlerController.signal;
    const task = operation(signal).catch((error: unknown) => {
      if (signal.aborted) return;
      this.logger.error(`Discord ${kind} handler failed`, { error });
    });
    this.activeEventHandlers.add(task);
    void task.then(() => {
      this.activeEventHandlers.delete(task);
    });
  }

  private stopEventHandlers(): Promise<void> {
    if (this.eventHandlerStopPromise) return this.eventHandlerStopPromise;

    this.eventHandlersClosed = true;
    this.eventHandlerController.abort(
      new Error("Discord interface has been stopped"),
    );
    for (const interval of this.typingIntervals.values()) {
      clearInterval(interval);
    }
    this.typingIntervals.clear();

    const client = this.client;
    this.client = null;
    const destroy = client?.destroy() ?? Promise.resolve();
    const handlers = [...this.activeEventHandlers];
    this.eventHandlerStopPromise = this.drainEventHandlers(destroy, handlers);
    return this.eventHandlerStopPromise;
  }

  private async drainEventHandlers(
    destroy: Promise<void>,
    handlers: Promise<void>[],
  ): Promise<void> {
    const results = await Promise.allSettled([destroy, ...handlers]);
    this.pendingConfirmations.clear();
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }

  // ── Abstract method implementation ──

  override sendMessageToChannel({
    channelId,
    message,
  }: {
    channelId: string | null;
    message: string;
  }): void {
    if (!channelId || !this.client) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!isSendable(channel)) return;
    const chunks = chunkMessage(message, DISCORD_MAX_LENGTH);
    for (const chunk of chunks) {
      channel
        .send(chunk)
        .catch((e: unknown) =>
          this.logger.error("Failed to send message", { error: e }),
        );
    }
  }

  protected override async sendMessageWithId({
    channelId,
    message,
    approvalCard,
    approvalCards: approvalCardsInput,
  }: {
    channelId: string | null;
    message: string;
    approvalCard?: ToolApprovalCard | undefined;
    approvalCards?: ToolApprovalCard[] | undefined;
  }): Promise<string | undefined> {
    const approvalCards =
      approvalCardsInput ?? (approvalCard ? [approvalCard] : []);
    const payload =
      approvalCards.length > 0
        ? this.buildApprovalMessagePayload(message, approvalCards)
        : message;
    return this.sendPayloadWithId(channelId, payload);
  }

  private async sendPayloadWithId(
    channelId: string | null,
    payload: DiscordSendPayload,
  ): Promise<string | undefined> {
    if (!channelId || !this.client) return undefined;
    const channel = this.client.channels.cache.get(channelId);
    if (!isSendable(channel)) return undefined;

    if (typeof payload !== "string") {
      const sent = await channel.send(payload);
      return sent.id;
    }

    const chunks = chunkMessage(payload, DISCORD_MAX_LENGTH);
    let lastId: string | undefined;
    for (const chunk of chunks) {
      const sent = await channel.send(chunk);
      lastId = sent.id;
    }
    return lastId;
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
    if (!channelId || !this.client) return false;
    const channel = this.client.channels.cache.get(channelId);
    if (!isSendable(channel)) return false;
    try {
      const msg = await channel.messages.fetch(messageId);
      await msg.edit(newMessage.slice(0, DISCORD_MAX_LENGTH));
      return true;
    } catch {
      return false;
    }
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  // ── Message handling ──

  private async handleMessage(
    message: Message,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    if (message.author.id === this.client?.user?.id) return;
    if (!this.context) return;

    const isDM = !message.guild;
    const isThread = message.channel.isThread();

    if (isDM && !this.config.allowDMs) return;

    const botIsMentioned =
      !!this.client?.user &&
      message.mentions.has(this.client.user, { ignoreEveryone: true });

    // Ignore other bots unless they explicitly mention this bot
    if (message.author.bot && !botIsMentioned) return;

    const isOwnThread =
      isThread &&
      "ownerId" in message.channel &&
      message.channel.ownerId === this.client?.user?.id;
    const spaceChannelId = this.getSpaceChannelId(message);
    const isConfiguredSpace = !isDM && this.isConfiguredSpace(spaceChannelId);
    const permissionContext: PermissionLookupContext = {
      channelId: spaceChannelId,
      isBot: message.author.bot,
    };

    // allowedChannels gates chat, passive capture, and URL capture
    if (
      this.config.allowedChannels.length > 0 &&
      !isDM &&
      !this.isAllowedChannel(message.channel.id, spaceChannelId)
    ) {
      return;
    }

    const willRouteToAgent =
      isDM || isOwnThread || !this.config.requireMention || botIsMentioned;

    if (
      isConfiguredSpace &&
      (!willRouteToAgent || this.willRouteUseNonSpaceConversation(message))
    ) {
      await this.capturePassiveSpaceMessage(message, spaceChannelId).catch(
        (error: unknown) =>
          this.logger.error("Passive Discord space capture failed", {
            error,
            channelId: spaceChannelId,
          }),
      );
      signal.throwIfAborted();
    }

    // In server channels / foreign threads: require mention.
    // In own threads: respond freely (user continuing a conversation).
    // At this fallback, try URL capture before returning.
    if (!willRouteToAgent) {
      if (this.config.captureUrls) {
        const urls = this.extractCaptureableUrls(
          message.content,
          this.config.blockedUrlDomains,
        );
        if (urls.length > 0) {
          await message
            .react(this.config.captureUrlEmoji)
            .catch((e: unknown) =>
              this.logger.debug("React failed", { error: e }),
            );
          for (const url of urls) {
            await this.captureUrlViaAgent(
              url,
              message.channel.id,
              message.author.id,
              "discord",
              permissionContext,
            ).catch((e: unknown) =>
              this.logger.error("URL capture failed", { error: e, url }),
            );
            signal.throwIfAborted();
          }
        }
      }
      return;
    }

    // Build agent message: text + any file attachments
    let agentMessage = this.stripMention(message.content);

    if (message.attachments.size > 0) {
      const userLevel = await this.resolveDiscordUserPermissionLevel(
        this.context,
        message.author.id,
        permissionContext,
      );
      const canUpload = userLevel === "anchor" || userLevel === "trusted";

      if (canUpload) {
        for (const attachment of message.attachments.values()) {
          const filename = attachment.name;
          const mimetype = attachment.contentType ?? undefined;
          const size = attachment.size;

          if (!this.isUploadableTextFile(filename, mimetype)) continue;
          if (!this.isFileSizeAllowed(size)) continue;

          try {
            const fileContent = await this.fetchText(attachment.url);
            signal.throwIfAborted();
            agentMessage +=
              "\n\n" + this.formatFileUploadMessage(filename, fileContent);
          } catch (e: unknown) {
            this.logger.error("Failed to download attachment", {
              error: e,
              filename,
            });
          }
        }
      }
    }

    agentMessage = agentMessage.trim();
    if (!agentMessage) return;

    const channelId = message.channel.id;
    signal.throwIfAborted();
    await this.routeToAgent(
      agentMessage,
      channelId,
      message,
      permissionContext,
      signal,
    );
  }

  private async handleInteraction(
    interaction: Interaction,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    if (!this.context || !interaction.isButton()) return;

    const parsed = this.parseApprovalButtonCustomId(interaction.customId);
    if (!parsed) return;

    const conversationId = `discord-${interaction.channelId}`;
    const pendingApprovalIds = this.pendingConfirmations.get(conversationId);
    if (!pendingApprovalIds?.has(parsed.approvalId)) {
      await interaction
        .reply({
          content: "This approval is no longer pending or has changed.",
          ephemeral: true,
        })
        .catch((error: unknown) =>
          this.logger.debug("Failed to reply to stale approval button", {
            error,
          }),
        );
      return;
    }

    await interaction
      .deferUpdate()
      .catch((error: unknown) =>
        this.logger.debug("Failed to defer approval button", { error }),
      );

    await this.clearApprovalInteractionComponents(interaction);
    signal.throwIfAborted();

    const confirmationContext =
      await this.buildInteractionConfirmationContext(interaction);
    const response = await this.context.agent.confirmPendingAction(
      conversationId,
      parsed.confirmed,
      parsed.approvalId,
      confirmationContext,
      signal,
    );
    signal.throwIfAborted();

    await this.handleAgentResponseToolStatuses(response, conversationId);
    signal.throwIfAborted();

    this.syncPendingApprovalsAfterResolution(
      conversationId,
      parsed.approvalId,
      response,
    );

    await this.sendApprovalResultMessage({
      channelId: interaction.channelId,
      response,
      userPermissionLevel: confirmationContext.userPermissionLevel ?? "public",
    });
  }

  private async clearApprovalInteractionComponents(
    interaction: ButtonInteraction,
  ): Promise<void> {
    await interaction.message
      .edit({ components: [] })
      .catch((error: unknown) =>
        this.logger.debug("Failed to clear approval buttons", { error }),
      );
  }

  private async buildInteractionConfirmationContext(
    interaction: ButtonInteraction,
  ): Promise<ChatContext> {
    if (!this.context) {
      throw new Error("Discord context is not registered");
    }

    const auth = await this.resolveDiscordAuth(
      this.context,
      interaction.user.id,
      { channelId: interaction.channelId },
    );
    return {
      userPermissionLevel: auth.permissionLevel,
      interfaceType: "discord",
      channelId: interaction.channelId,
      actor: {
        identity: auth.principal
          ? {
              kind: "user",
              userId: auth.principal.userId,
              ...(auth.principal.canonicalId
                ? { canonicalId: auth.principal.canonicalId }
                : {}),
            }
          : {
              kind: "external",
              externalActorId: createExternalActorId(
                "discord",
                interaction.user.id,
              ),
            },
        interfaceType: "discord",
        role: "user",
        displayName:
          auth.principal?.displayName ?? interaction.user.displayName,
        username: interaction.user.username,
        isBot: Boolean(interaction.user.bot),
      },
    };
  }

  private async capturePassiveSpaceMessage(
    discordMessage: Message,
    spaceChannelId: string,
  ): Promise<void> {
    if (!this.context) return;

    const content = this.stripMention(discordMessage.content).trim();
    if (!content) return;

    const conversationId = `discord-${spaceChannelId}`;
    const channelName = this.getChannelName(discordMessage);
    const authResolution = await this.resolveDiscordAuth(
      this.context,
      discordMessage.author.id,
      { channelId: spaceChannelId },
    );

    await this.context.conversations.start({
      sessionId: conversationId,
      interfaceType: "discord",
      channelId: spaceChannelId,
      metadata: {
        channelName,
        interfaceType: "discord",
        channelId: spaceChannelId,
      },
    });

    await this.context.conversations.addMessage({
      conversationId,
      role: "user",
      content,
      metadata: this.buildUserMessageMetadata(
        discordMessage,
        spaceChannelId,
        channelName,
        {
          threadId: discordMessage.channel.isThread()
            ? discordMessage.channel.id
            : undefined,
          ...(authResolution.principal
            ? { principal: authResolution.principal }
            : {}),
        },
      ),
    });
  }

  private async routeToAgent(
    message: string,
    channelId: string,
    discordMessage: Message,
    permissionContext: PermissionLookupContext,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.context) return;

    const agentService = this.context.agent;
    let replyChannelId = channelId;

    if (
      this.config.useThreads &&
      discordMessage.guild &&
      !discordMessage.channel.isThread()
    ) {
      try {
        const thread = await discordMessage.startThread({
          name: truncateText(message, THREAD_NAME_MAX_LENGTH),
          autoArchiveDuration: this.config.threadAutoArchive,
        });
        replyChannelId = thread.id;
      } catch (e: unknown) {
        this.logger.error("Failed to create thread", { error: e });
      }
    }

    signal.throwIfAborted();
    const conversationId = `discord-${replyChannelId}`;
    const authResolution = await this.resolveDiscordAuth(
      this.context,
      discordMessage.author.id,
      permissionContext,
    );
    const userPermissionLevel = authResolution.permissionLevel;
    const channelName = this.getChannelName(discordMessage);

    this.startProcessingInput(replyChannelId);
    try {
      // Start typing in the reply target (thread or original channel)
      const replyChannel = this.client?.channels.cache.get(replyChannelId);
      if (isSendable(replyChannel)) {
        this.startTypingIndicator(replyChannel);
      }

      if (this.pendingConfirmations.has(conversationId)) {
        const handledConfirmation = await this.handleConfirmationResponse(
          message,
          conversationId,
          replyChannelId,
          discordMessage,
          permissionContext,
          signal,
        );
        if (handledConfirmation) return;
      }

      const response = await agentService.chat(
        message,
        conversationId,
        {
          userPermissionLevel,
          interfaceType: "discord",
          ...this.buildUserMessageMetadata(
            discordMessage,
            channelId,
            channelName,
            {
              threadId:
                replyChannelId !== channelId ||
                discordMessage.channel.isThread()
                  ? replyChannelId
                  : undefined,
              ...(authResolution.principal
                ? { principal: authResolution.principal }
                : {}),
            },
          ),
        },
        signal,
      );
      signal.throwIfAborted();

      await this.handleAgentResponseToolStatuses(response, conversationId);
      signal.throwIfAborted();

      const approvalCards = getPendingApprovalCards(response.cards);
      if (approvalCards.length > 0) {
        this.pendingConfirmations.set(
          conversationId,
          new Set(approvalCards.map((card) => card.id)),
        );
      } else if (response.pendingConfirmations) {
        this.pendingConfirmations.set(
          conversationId,
          new Set(
            response.pendingConfirmations.map(
              (confirmation) => confirmation.id,
            ),
          ),
        );
      } else {
        this.pendingConfirmations.delete(conversationId);
      }

      const messageId = await this.sendMessageWithId({
        channelId: replyChannelId,
        message: formatApprovalRequestText(response.text, approvalCards),
        approvalCards,
      });

      if (messageId && response.toolResults) {
        for (const toolResult of response.toolResults) {
          if (toolResult.jobId) {
            this.trackAgentResponseForJob(
              toolResult.jobId,
              messageId,
              replyChannelId,
            );
          }
        }
      }
    } catch (error: unknown) {
      if (signal.aborted) return;
      this.logger.error("Error handling message", {
        error,
        channelId: replyChannelId,
      });
      this.sendMessageToChannel({
        channelId: replyChannelId,
        message: `**Error:** ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      this.endProcessingInput();
      this.stopTypingIndicator(replyChannelId);
    }
  }

  // ── Confirmations ──

  private buildApprovalMessagePayload(
    text: string,
    approvalCards: ToolApprovalCard[],
  ): DiscordSendOptions {
    const multiple = approvalCards.length > 1;
    return {
      content: truncateText(
        text.trim().length > 0
          ? `${text}\n\nUse the buttons below${multiple ? " for the matching action" : ", or reply **yes** / **no**"}.`
          : `Use the buttons below${multiple ? " for the matching action" : ", or reply **yes** / **no**"}.`,
        DISCORD_MAX_LENGTH,
      ),
      embeds: approvalCards.slice(0, 10).map((approvalCard, index) => ({
        title: multiple
          ? `Approval required #${index + 1}`
          : "Approval required",
        description: truncateText(approvalCard.summary, 1024),
        color: 0xf59e0b,
        fields: [
          {
            name: "Tool",
            value: `\`${approvalCard.toolName}\``,
            inline: true,
          },
          {
            name: "Approval ID",
            value: `\`${truncateText(approvalCard.id, 80)}\``,
            inline: true,
          },
          ...(approvalCard.preview
            ? [
                {
                  name: "Preview",
                  value: truncateText(approvalCard.preview, 1024),
                },
              ]
            : []),
        ],
      })),
      components: approvalCards.slice(0, 5).map((approvalCard, index) => ({
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: multiple ? `Approve #${index + 1}` : "Approve",
            custom_id: this.formatApprovalButtonCustomId(true, approvalCard.id),
          },
          {
            type: 2,
            style: 4,
            label: multiple ? `Decline #${index + 1}` : "Decline",
            custom_id: this.formatApprovalButtonCustomId(
              false,
              approvalCard.id,
            ),
          },
        ],
      })),
    };
  }

  private formatApprovalButtonCustomId(
    confirmed: boolean,
    approvalId: string,
  ): string {
    return `brains:approval:${confirmed ? "approve" : "deny"}:${approvalId}`;
  }

  private parseApprovalButtonCustomId(
    customId: string,
  ): { confirmed: boolean; approvalId: string } | undefined {
    const match = /^brains:approval:(approve|deny):(.+)$/.exec(customId);
    if (!match) return undefined;
    const action = match[1];
    const approvalId = match[2];
    if (!approvalId) return undefined;
    return { confirmed: action === "approve", approvalId };
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

  private syncPendingApprovalsAfterResolution(
    conversationId: string,
    resolvedApprovalId: string,
    response: AgentResponse,
  ): void {
    const approvalCards = getPendingApprovalCards(response.cards);
    const pendingIds =
      approvalCards.length > 0
        ? approvalCards.map((card) => card.id)
        : response.pendingConfirmations?.map((confirmation) => confirmation.id);

    if (pendingIds && pendingIds.length > 0) {
      this.pendingConfirmations.set(conversationId, new Set(pendingIds));
      return;
    }

    this.removePendingApproval(conversationId, resolvedApprovalId);
  }

  private async sendApprovalResultMessage({
    channelId,
    response,
    userPermissionLevel,
  }: {
    channelId: string;
    response: AgentResponse;
    userPermissionLevel: UserPermissionLevel;
  }): Promise<string | undefined> {
    const files = await this.resolveDiscordArtifactFiles(
      response,
      userPermissionLevel,
    );
    const resultCard = getResolvedApprovalCard(response.cards);
    if (!resultCard) {
      if (files.length === 0) {
        return this.sendMessageWithId({ channelId, message: response.text });
      }
      return this.sendPayloadWithId(channelId, {
        content: truncateText(response.text, DISCORD_MAX_LENGTH),
        files,
      });
    }

    return this.sendPayloadWithId(
      channelId,
      this.buildApprovalResultMessagePayload(resultCard, files),
    );
  }

  private async resolveDiscordUserPermissionLevel(
    context: InterfacePluginContext,
    userId: string,
    permissionContext: PermissionLookupContext,
  ): Promise<UserPermissionLevel> {
    return (await this.resolveDiscordAuth(context, userId, permissionContext))
      .permissionLevel;
  }

  private async resolveDiscordAuth(
    context: InterfacePluginContext,
    userId: string,
    permissionContext: PermissionLookupContext,
  ): Promise<{
    permissionLevel: UserPermissionLevel;
    principal?: AuthPrincipal;
  }> {
    const resolution = await getActiveAuthService()?.resolveIdentityAccess({
      type: "discord",
      subject: userId,
    });
    if (resolution?.state === "resolved") {
      return {
        permissionLevel: resolution.principal.permissionLevel,
        principal: resolution.principal,
      };
    }
    if (resolution?.state === "denied") {
      return { permissionLevel: "public" };
    }
    return {
      permissionLevel: context.permissions.getUserLevel(
        "discord",
        userId,
        permissionContext,
      ),
    };
  }

  private async resolveDiscordArtifactFiles(
    response: AgentResponse,
    userPermissionLevel: UserPermissionLevel,
  ): Promise<Array<Record<string, unknown>>> {
    const delivery = await this.resolveNativeArtifactDelivery({
      cards: response.cards,
      userPermissionLevel,
      displayBaseUrl: this.getPreferredDisplayBaseUrl(),
      maxBytes: DISCORD_NATIVE_ARTIFACT_MAX_BYTES,
    });
    return delivery.files.map((file) => ({
      attachment: Buffer.from(file.data),
      name: file.filename,
    }));
  }

  private buildApprovalResultMessagePayload(
    approvalCard: ToolApprovalCard,
    files: Array<Record<string, unknown>> = [],
  ): DiscordSendOptions {
    const result = buildApprovalResultView(approvalCard);
    const fields: Array<Record<string, unknown>> = [
      {
        name: "Tool",
        value: `\`${result.toolName}\``,
        inline: true,
      },
    ];
    if (result.error) {
      fields.push({
        name: "Error",
        value: truncateText(result.error, 1024),
      });
    }

    return {
      content: "",
      embeds: [
        {
          title: APPROVAL_RESULT_TITLES[result.resolution],
          description: truncateText(result.summary, 1024),
          color: APPROVAL_RESULT_COLORS[result.resolution],
          fields,
        },
      ],
      components: [],
      ...(files.length > 0 ? { files } : {}),
    };
  }

  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    channelId: string,
    discordMessage: Message,
    permissionContext: PermissionLookupContext,
    signal: AbortSignal,
  ): Promise<boolean> {
    const context = this.context;
    if (!context) return false;
    const parsed = parseConfirmationResponse(message);
    if (!parsed) return false;
    const approvalIds = this.pendingConfirmations.get(conversationId);
    if (approvalIds && approvalIds.size > 1) {
      this.sendMessageToChannel({
        channelId,
        message:
          "Multiple approvals are pending. Please use the matching Discord button.",
      });
      return true;
    }

    const approvalId = approvalIds ? [...approvalIds][0] : undefined;
    if (!approvalId) {
      this.pendingConfirmations.delete(conversationId);
      this.sendMessageToChannel({
        channelId,
        message: "No pending approval to resolve.",
      });
      return true;
    }
    const channelName = this.getChannelName(discordMessage);
    const userPermissionLevel = await this.resolveDiscordUserPermissionLevel(
      context,
      discordMessage.author.id,
      permissionContext,
    );
    const response = await context.agent.confirmPendingAction(
      conversationId,
      parsed.confirmed,
      approvalId,
      {
        userPermissionLevel,
        interfaceType: "discord",
        channelId,
        channelName,
        ...this.buildUserMessageMetadata(
          discordMessage,
          channelId,
          channelName,
        ),
      },
      signal,
    );
    signal.throwIfAborted();
    await this.handleAgentResponseToolStatuses(response, conversationId);
    signal.throwIfAborted();
    this.syncPendingApprovalsAfterResolution(
      conversationId,
      approvalId,
      response,
    );
    await this.sendApprovalResultMessage({
      channelId: channelId,
      response,
      userPermissionLevel,
    });
    return true;
  }

  // ── Typing indicator ──

  private startTypingIndicator(channel: SendableChannel): void {
    if (!this.config.showTypingIndicator) return;
    this.stopTypingIndicator(channel.id);
    channel
      .sendTyping()
      .catch((e: unknown) =>
        this.logger.debug("Typing indicator failed", { error: e }),
      );
    const interval = setInterval(() => {
      channel
        .sendTyping()
        .catch((e: unknown) =>
          this.logger.debug("Typing indicator failed", { error: e }),
        );
    }, TYPING_REFRESH_MS);
    this.typingIntervals.set(channel.id, interval);
  }

  private stopTypingIndicator(channelId: string): void {
    const interval = this.typingIntervals.get(channelId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(channelId);
    }
  }

  // ── Utilities ──

  private getAuthorDisplayName(message: Message): string {
    return (
      message.member?.displayName ??
      message.author.globalName ??
      message.author.username
    );
  }

  private getChannelName(message: Message): string {
    return message.guild?.name ?? "DM";
  }

  private getPreferredDisplayBaseUrl(): string | undefined {
    if (this.context?.preferLocalUrls && this.context.localSiteUrl) {
      return this.context.localSiteUrl;
    }
    return this.context?.siteUrl ?? this.context?.localSiteUrl;
  }

  private getSpaceChannelId(message: Message): string {
    if (!message.channel.isThread()) return message.channel.id;
    if (
      "parentId" in message.channel &&
      typeof message.channel.parentId === "string"
    ) {
      return message.channel.parentId;
    }
    if (
      "parent" in message.channel &&
      message.channel.parent &&
      typeof message.channel.parent === "object" &&
      "id" in message.channel.parent &&
      typeof message.channel.parent.id === "string"
    ) {
      return message.channel.parent.id;
    }
    return message.channel.id;
  }

  private isConfiguredSpace(channelId: string): boolean {
    const spaceId = `discord:${channelId}`;
    return (
      this.context?.spaces.some((selector) =>
        matchSpaceSelector(selector, spaceId),
      ) ?? false
    );
  }

  private isAllowedChannel(channelId: string, spaceChannelId: string): boolean {
    return (
      this.config.allowedChannels.includes(channelId) ||
      this.config.allowedChannels.includes(spaceChannelId)
    );
  }

  private willRouteUseNonSpaceConversation(message: Message): boolean {
    if (message.channel.isThread()) {
      return this.getSpaceChannelId(message) !== message.channel.id;
    }
    return this.config.useThreads && Boolean(message.guild);
  }

  private buildUserMessageMetadata(
    message: Message,
    channelId: string,
    channelName: string,
    options: {
      threadId?: string | undefined;
      principal?: AuthPrincipal | undefined;
    } = {},
  ): Record<string, unknown> {
    return {
      actor: {
        identity: options.principal
          ? {
              kind: "user",
              userId: options.principal.userId,
              ...(options.principal.canonicalId
                ? { canonicalId: options.principal.canonicalId }
                : {}),
            }
          : {
              kind: "external",
              externalActorId: createExternalActorId(
                "discord",
                message.author.id,
              ),
            },
        interfaceType: "discord",
        role: "user",
        displayName:
          options.principal?.displayName ?? this.getAuthorDisplayName(message),
        username: message.author.username,
        isBot: Boolean(message.author.bot),
      },
      source: {
        messageId: message.id,
        channelId,
        channelName,
        ...(options.threadId ? { threadId: options.threadId } : {}),
        metadata: {
          ...(message.guild?.id ? { guildId: message.guild.id } : {}),
          ...(message.guild?.name ? { guildName: message.guild.name } : {}),
        },
      },
    };
  }

  private stripMention(content: string): string {
    if (!this.client?.user) return content;
    return content
      .replace(new RegExp(`<@!?${this.client.user.id}>`, "g"), "")
      .trim();
  }
}
