import { spaceNoticeContract, type AgentResponse } from "@brains/contracts";
import {
  interfaceRuntime,
  withChannels,
  withDaemon,
  withMessageTransport,
  withWebRoutes,
  type FirstPartySlotContext,
  type InterfaceRuntime,
  type MessageTransport,
  type MessageTransportEdit,
  type MessageTransportSend,
  captureUrlViaAgent,
  extractCaptureableUrls,
  getToolStatusKey,
  type ChannelDeliveryInput,
  type ChannelDeliveryResult,
  type DaemonHealth,
  type JobProgressEvent,
  type MessageInterfaceOutput,
  type ScopedRuntimeUploadStore,
  type ToolStatusUpdate,
} from "@brains/sdk/internal/interface-runtime";
import type { PluginPackageDefinition } from "@brains/sdk";
import { defineInterface } from "@brains/sdk/interfaces";
import {
  chatConfigSchema,
  type ChatConfig,
  type MatrixChatAdapterConfig,
} from "./config";
import { PromptActionStore } from "./prompt-action-store";
import { ThreadRegistry } from "./thread-registry";
import { ToolStatusMessenger } from "./tool-status-messenger";
import { buildProgressCard } from "./chat-cards";
import { parseChatPlatform, toPlatformText } from "./chat-platform";
import { ChatResponseCoordinator } from "./chat-response-coordinator";
import { ChatUploadCoordinator } from "./chat-upload-coordinator";
import { toPlatformPostOutput } from "./chat-output";
import { postToThread } from "./chat-post";
import { DiscordGatewayLoop } from "./discord-gateway-loop";
import { SlackSocketLoop } from "./slack-socket-loop";
import { ChatSdkAppHost, type ChatSdkApp } from "./chat-sdk-app";
import { createChatSdkApp } from "./chat-sdk";
import { SubscriptionRouter } from "./subscription-router";
import { ChatInputBuilder, type ChatFetch } from "./chat-input-builder";
import { postSpaceNotice } from "./space-notice";
import { ChannelNames } from "./channel-names";
import { MATRIX_USER_ID_PATTERN, MatrixDelivery } from "./matrix-delivery";
import { matrixInviteDecision } from "./matrix-invites";
import type { ChatIdentityAccess } from "./chat-identity";
import {
  createDiscordThreadSubscriptionStore,
  createSlackThreadSubscriptionStore,
  createThreadSubscriptionStore,
  type ChatThreadSubscriptionStore,
} from "./subscription-state";
import { getThreadIdParts, isBotCreatedDiscordThread } from "./discord-routing";
import {
  ChatTurnController,
  isEnabledChatPlatform,
} from "./chat-turn-controller";
import { clearDiscordMessageComponents } from "./discord-message-components";
import { retiredChatUploadNamespaces } from "./upload-store";

/** Cap on retained prompt-action tokens; oldest never-clicked ones evict. */
const MAX_PROMPT_ACTIONS = 1000;

/** The interface type its progress and tool events are routed to. */
const CHAT_INTERFACE_ID = "chat";

/** Delivery on the matrix channel, available whenever Matrix is configured. */
function matrixDelivery(
  config: MatrixChatAdapterConfig,
  fetchFn: ChatFetch | undefined,
): {
  isAvailable(): Promise<boolean>;
  send(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult>;
} {
  const delivery = new MatrixDelivery({
    baseUrl: config.baseUrl,
    userId: config.userId,
    password: config.password,
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
  return {
    isAvailable: (): Promise<boolean> => Promise.resolve(true),
    send: (input): Promise<ChannelDeliveryResult> => delivery.send(input),
  };
}

/**
 * Runtime collaborators the interface needs that are not configuration.
 *
 * Config is schema-validated operator input; a fetch implementation is not.
 * Threading it here lets a test hand the attachment downloader a fake and
 * read the requests off it, instead of reassigning globalThis.fetch for the
 * whole process and restoring it afterwards. Production leaves it unset.
 */
export interface ChatInterfaceDeps {
  fetch?: ChatFetch | undefined;
  /**
   * How a chat sender's linked account is resolved. Overridable so tests can
   * supply a linked principal directly; production reads the brain's auth
   * backend, per call, because auth-service binds it after registration.
   */
  identityAccess?: (() => ChatIdentityAccess | undefined) | undefined;
}

/** What a running chat interface keeps: the Chat SDK app and what drives it. */
interface ChatState {
  readonly threadRegistry: ThreadRegistry;
  readonly toolStatusMessenger: ToolStatusMessenger;
  readonly compactingSlackApprovalToolStatuses: Set<string>;
  readonly uploadCoordinator: ChatUploadCoordinator;
  readonly responseCoordinator: ChatResponseCoordinator;
  readonly gatewayLoop: DiscordGatewayLoop;
  readonly slackSocketLoop: SlackSocketLoop;
  readonly chatApp: ChatSdkAppHost;
  chatAppRunning: boolean;
}

type ChatSlotContext = FirstPartySlotContext<ChatConfig, ChatState>;

export type ChatInterfaceDefinition = PluginPackageDefinition<
  typeof chatConfigSchema,
  "interface"
>;

/** The links chat posts: the local site when it is preferred, else the site. */
function displayBaseUrl(runtime: InterfaceRuntime): string | undefined {
  if (runtime.preferLocalUrls && runtime.localSiteUrl) {
    return runtime.localSiteUrl;
  }
  return runtime.siteUrl ?? runtime.localSiteUrl;
}

/** Send a message to a thread, and the sent message for editing. */
async function sendWithId(
  state: ChatState,
  { channelId, message }: MessageTransportSend,
): Promise<string | undefined> {
  const thread = state.threadRegistry.get(channelId);
  if (!thread) return undefined;
  const sent = await postToThread(thread, channelId, message, {
    onSent: (posted) => state.threadRegistry.trackMessage(thread.id, posted),
  });
  return sent?.id;
}

/**
 * The chat interface: one Chat SDK app for Discord and Slack, which routes
 * each platform's messages to the agent, shows its replies, approvals and
 * cards, follows job progress and tool status in place, and answers the
 * space notices other packages post. The collaborators default to the real
 * ones; a test hands its own.
 */
export function createChatInterface(
  deps: ChatInterfaceDeps = {},
): ChatInterfaceDefinition {
  const chat = defineInterface({
    id: CHAT_INTERFACE_ID,
    config: chatConfigSchema,
    setup: async (context): Promise<ChatState> => {
      const { config } = context;
      const runtime = interfaceRuntime(context);
      const { logger, messages } = runtime;

      // The platform upload stores chat kept before it wrote the shared one
      // hold only expired uploads, and nothing reads them.
      for (const namespace of retiredChatUploadNamespaces) {
        await runtime.retireUploads(namespace).catch((error: unknown) => {
          logger.warn("Could not delete retired chat uploads", {
            namespace,
            error,
          });
        });
      }

      const threadRegistry = new ThreadRegistry();
      const promptActions = new PromptActionStore(MAX_PROMPT_ACTIONS);
      const toolStatusMessenger = new ToolStatusMessenger(threadRegistry);
      const uploadCoordinator = new ChatUploadCoordinator({
        host: runtime,
        logger,
      });
      const state: ChatState = {
        threadRegistry,
        toolStatusMessenger,
        compactingSlackApprovalToolStatuses: new Set<string>(),
        uploadCoordinator,
        responseCoordinator: new ChatResponseCoordinator({
          host: runtime,
          getDisplayBaseUrl: (): string | undefined => displayBaseUrl(runtime),
          registerPromptAction: (threadId, action): string =>
            promptActions.register(threadId, action),
          clearMessageComponents: async (
            threadId,
            messageId,
          ): Promise<void> => {
            const botToken = config.adapters.discord?.botToken;
            if (!botToken) return;
            await clearDiscordMessageComponents({
              threadId,
              messageId,
              botToken,
              logger,
              ...(deps.fetch ? { fetchFn: deps.fetch } : {}),
            });
          },
          sendMessageWithId: (input): Promise<string | undefined> =>
            sendWithId(state, input),
          handleAgentResponseToolStatuses: (
            response,
            conversationId,
          ): Promise<void> =>
            messages.handleAgentResponseToolStatuses(response, conversationId),
          trackAgentResponseForJob: (jobId, messageId, channelId): void => {
            messages.trackAgentResponseForJob(jobId, messageId, channelId);
          },
          threadRegistry,
          logger,
        }),
        gatewayLoop: new DiscordGatewayLoop({
          getApp: (): ChatSdkApp | undefined => state.chatApp.instance,
          gatewayRunMs: config.gatewayRunMs,
          gatewayRestartDelayMs: config.gatewayRestartDelayMs,
          logger,
        }),
        slackSocketLoop: new SlackSocketLoop({
          listenerRunMs: config.gatewayRunMs,
          restartDelayMs: config.gatewayRestartDelayMs,
          logger,
        }),
        chatApp: new ChatSdkAppHost({
          slack: config.adapters.slack,
          buildApp: (runtimeState): ChatSdkApp =>
            createChatSdkApp({
              userName: config.userName,
              discord: config.adapters.discord,
              slack: config.adapters.slack,
              matrix: config.adapters.matrix,
              ...(config.adapters.matrix
                ? {
                    acceptMatrixInvite: matrixInviteDecision({
                      allowDMs: config.adapters.matrix.allowDMs,
                      peerTrust: () => runtime.auth(),
                    }),
                  }
                : {}),
              gatewayLoop: state.gatewayLoop,
              slackSocketLoop: state.slackSocketLoop,
              runtimeState,
            }),
        }),
        chatAppRunning: false,
      };

      let discordSubscriptions: ChatThreadSubscriptionStore | undefined;
      let slackSubscriptions: ChatThreadSubscriptionStore | undefined;
      const matrixSubscriptions = config.adapters.matrix
        ? createThreadSubscriptionStore(runtime.classRuntimeState, "matrix")
        : undefined;
      if (config.adapters.discord)
        discordSubscriptions = createDiscordThreadSubscriptionStore(
          runtime.classRuntimeState,
        );
      if (config.adapters.slack)
        slackSubscriptions = createSlackThreadSubscriptionStore(
          runtime.classRuntimeState,
        );

      const turnController = new ChatTurnController({
        identityAccess:
          deps.identityAccess ??
          ((): ChatIdentityAccess | undefined => runtime.auth()),
        config,
        host: {
          context: runtime,
          startProcessingInput: (channelId): void => {
            messages.startProcessingInput(channelId);
          },
          endProcessingInput: (): void => {
            messages.endProcessingInput();
          },
          extractCaptureableUrls: (content, blockedDomains): string[] =>
            extractCaptureableUrls(content, blockedDomains),
          captureUrlViaAgent: (
            url,
            channelId,
            authorId,
            interfaceType,
            permissionContext,
          ): Promise<void> =>
            captureUrlViaAgent(
              runtime,
              url,
              channelId,
              authorId,
              interfaceType,
              permissionContext,
            ),
        },
        promptActions,
        threadRegistry,
        subscriptionRouter: new SubscriptionRouter({
          getSubscriptions: (
            platform: string,
          ): ChatThreadSubscriptionStore | undefined =>
            platform === "discord"
              ? discordSubscriptions
              : platform === "slack"
                ? slackSubscriptions
                : platform === "matrix"
                  ? matrixSubscriptions
                  : undefined,
          getPlatform: (thread): string => thread.adapter.name,
          isBotCreatedThread: isBotCreatedDiscordThread,
          logger,
        }),
        chatInputBuilder: new ChatInputBuilder({
          getUploadStore: (
            platform: string,
          ): ScopedRuntimeUploadStore | undefined =>
            platform === "discord" || platform === "slack"
              ? uploadCoordinator.getCanonicalStore()
              : undefined,
          getThreadIdParts,
          logger,
          fetch: (input, init): Promise<Response> =>
            (deps.fetch ?? fetch)(input, init),
        }),
        uploadCoordinator,
        responseCoordinator: state.responseCoordinator,
        channelNames: new ChannelNames(),
        logger: {
          debug: (message, details): void => logger.debug(message, details),
          error: (message, details): void => logger.error(message, details),
        },
      });
      turnController.registerHandlers(
        state.chatApp.build(runtime.classRuntimeState),
      );

      // Another plugin's note for a configured space, e.g. the cards a
      // channel pickup added; posted where the chat app runs.
      runtime.answer(spaceNoticeContract, async ({ request }) =>
        postSpaceNotice(
          {
            app: state.chatApp.instance,
            discordBotToken: config.adapters.discord?.botToken,
            logger,
            fetchFn: deps.fetch,
          },
          request,
        ),
      );
      return state;
    },
  });

  /** One channel per configured platform, in the worker too. */
  const withPlatformChannels = withChannels(chat, ({ config }) => [
    ...(config.adapters.discord
      ? [
          {
            descriptor: {
              type: "discord",
              displayName: "Discord",
              subjectLabel: "Discord user ID",
              subjectPattern: { source: "^[0-9]{17,20}$" },
              manualDelivery: true,
            },
          },
        ]
      : []),
    ...(config.adapters.slack
      ? [
          {
            descriptor: {
              type: "slack",
              displayName: "Slack",
              subjectLabel: "Slack member ID",
              subjectPattern: { source: "^[UW][A-Z0-9]+$" },
              manualDelivery: true,
            },
          },
        ]
      : []),
    ...(config.adapters.matrix
      ? [
          {
            descriptor: {
              type: "matrix",
              displayName: "Matrix",
              subjectLabel: "Matrix user ID",
              subjectPattern: { source: MATRIX_USER_ID_PATTERN.source },
            },
            // Straight to the homeserver: the worker delivers too, and no
            // Matrix sync runs there.
            delivery: matrixDelivery(config.adapters.matrix, deps.fetch),
          },
        ]
      : []),
  ]);

  /** The Discord and Slack webhooks, delegated to the Chat SDK app. */
  const withWebhooks = withWebRoutes(
    withPlatformChannels,
    ({ state }: ChatSlotContext) => state.chatApp.getWebRoutes(),
  );

  /** chat:chat, the Chat SDK app and its gateway and socket listeners. */
  const withChatApp = withDaemon(
    withWebhooks,
    ({ config, state }: ChatSlotContext) => {
      const discordEnabled = Boolean(config.adapters.discord);
      const slackSocketEnabled = config.adapters.slack?.mode === "socket";
      if (
        !discordEnabled &&
        !config.adapters.slack &&
        !config.adapters.matrix
      ) {
        return undefined;
      }

      return {
        id: CHAT_INTERFACE_ID,
        start: async (): Promise<void> => {
          await state.chatApp.initialize();
          state.chatAppRunning = true;
          if (discordEnabled) state.gatewayLoop.start();
          if (slackSocketEnabled) state.slackSocketLoop.start();
        },
        stop: async (): Promise<void> => {
          await state.gatewayLoop.stop();
          await state.slackSocketLoop.stop();
          state.threadRegistry.clear();
          state.uploadCoordinator.clear();
          state.responseCoordinator.clear();
          state.toolStatusMessenger.clear();
          await state.chatApp.shutdown();
          state.chatAppRunning = false;
        },
        healthCheck: async (): Promise<DaemonHealth> => {
          const healthy =
            state.chatAppRunning &&
            (!discordEnabled || state.gatewayLoop.isRunning()) &&
            (!slackSocketEnabled || state.slackSocketLoop.isRunning());
          return {
            status: healthy ? "healthy" : "error",
            message: healthy ? "Chat SDK app running" : "Chat SDK app stopped",
            lastCheck: new Date(),
          };
        },
      };
    },
  );

  /**
   * How chat posts, edits and renders what the runtime coordinates: replies
   * and progress as platform cards or text chunks, in the thread they belong
   * to, and job and tool events of either platform routed as chat's own.
   */
  return withMessageTransport(
    withChatApp,
    (context: ChatSlotContext): MessageTransport => {
      const { config, state } = context;
      const runtime = interfaceRuntime(context);
      const { logger } = runtime;
      return {
        send: ({ channelId, message }: MessageTransportSend): void => {
          const thread = state.threadRegistry.get(channelId);
          if (!thread) return;
          postToThread(thread, channelId, message).catch((error: unknown) =>
            logger.error("Failed to send chat message", { error, channelId }),
          );
        },
        sendWithId: (request) => sendWithId(state, request),
        edit: async ({
          channelId,
          messageId,
          message,
        }: MessageTransportEdit): Promise<boolean> => {
          const sent = state.threadRegistry.getMessage(channelId, messageId);
          if (!sent) return false;
          try {
            const edited = await sent.edit(
              toPlatformPostOutput(channelId, message) ??
                toPlatformText(
                  channelId,
                  typeof message === "string" ? message : "",
                ),
            );
            if (channelId) state.threadRegistry.trackMessage(channelId, edited);
            return true;
          } catch {
            // The platform rejected the edit. The boolean is the contract
            // here; callers retry or fall back rather than inspect a reason.
            return false;
          }
        },
        formatProgress: (event: JobProgressEvent): MessageInterfaceOutput =>
          buildProgressCard(event),
        formatCompletion: (event: JobProgressEvent): MessageInterfaceOutput =>
          buildProgressCard(event),
        progressEvent: async (event, next): Promise<void> => {
          const interfaceType = event.metadata.interfaceType;
          let routedEvent = event;
          if (interfaceType && interfaceType !== CHAT_INTERFACE_ID) {
            if (!isEnabledChatPlatform(config, interfaceType)) return;
            routedEvent = {
              ...event,
              metadata: {
                ...event.metadata,
                interfaceType: CHAT_INTERFACE_ID,
              },
            };
          }

          await next(routedEvent);
          await state.responseCoordinator.deliverCompletedJobArtifacts(
            routedEvent,
          );
        },
        toolActivity: async (event, next): Promise<void> => {
          if (event.interfaceType === CHAT_INTERFACE_ID) {
            await next(event);
            return;
          }
          if (!isEnabledChatPlatform(config, event.interfaceType)) return;

          await next({ ...event, interfaceType: CHAT_INTERFACE_ID });
        },
        toolStatus: async (update: ToolStatusUpdate): Promise<void> => {
          if (update.interfaceType !== CHAT_INTERFACE_ID || !update.channelId)
            return;
          const isSlack = parseChatPlatform(update.channelId) === "slack";
          const isActiveSlackConfirmation =
            isSlack &&
            state.responseCoordinator.isActiveSlackConfirmation(
              update.conversationId,
            );
          const isCompactedApprovalStatus =
            isSlack &&
            state.compactingSlackApprovalToolStatuses.has(
              getToolStatusKey(update),
            );
          if (
            isCompactedApprovalStatus ||
            isActiveSlackConfirmation ||
            (isSlack && update.state === "completed")
          ) {
            await state.toolStatusMessenger.dismiss(update);
            return;
          }
          await state.toolStatusMessenger.handle(update);
        },
        agentResponseToolStatuses: async (
          response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
          conversationId: string,
          next: () => Promise<void>,
        ): Promise<void> => {
          const toolNames = new Set([
            ...(response.pendingConfirmations ?? []).map(
              (confirmation) => confirmation.toolName,
            ),
            ...(response.cards ?? [])
              .filter((card) => card.kind === "tool-approval")
              .map((card) => card.toolName),
          ]);
          const compactedKeys = conversationId.startsWith("slack-")
            ? [...toolNames].map((toolName) => `${conversationId}:${toolName}`)
            : [];
          for (const key of compactedKeys) {
            state.compactingSlackApprovalToolStatuses.add(key);
          }
          try {
            await next();
          } finally {
            for (const key of compactedKeys) {
              state.compactingSlackApprovalToolStatuses.delete(key);
            }
          }
        },
      };
    },
  );
}
