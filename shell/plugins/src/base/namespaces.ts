import type { GetMessagesOptions } from "@brains/conversation-service";
import type { JobsNamespace } from "@brains/job-queue";
import {
  createEnqueueBatchFn,
  createEnqueueJobFn,
  createRegisterHandlerFn,
} from "@brains/job-queue";
import type { MessageHandler, MessageSender } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import type { AppInfo } from "../contracts/app-info";
import type { Conversation, Message } from "../contracts/conversations";
import type { EvalHandler, InsightHandler, IShell } from "../interfaces";
import type { Channel } from "../utils/channels";
import { isChannel } from "../utils/channels";
import { toPublicAppInfo } from "./public-app-info";
import { toPublicConversation, toPublicMessage } from "./public-conversations";
import {
  toPublicAnchorProfile,
  toPublicBrainCharacter,
} from "./public-identity";
import type {
  IConversationsNamespace,
  IEndpointsNamespace,
  IEvalNamespace,
  IIdentityNamespace,
  IInsightsNamespace,
  IMessagingNamespace,
  TypedMessageHandler,
} from "./context";

export function createAppInfoGetter(shell: IShell): () => Promise<AppInfo> {
  return async (): Promise<AppInfo> => {
    return toPublicAppInfo(await shell.getAppInfo());
  };
}

export function createIdentityNamespace(
  shell: IShell,
  getAppInfo: () => Promise<AppInfo>,
): IIdentityNamespace {
  return {
    get: () => toPublicBrainCharacter(shell.getIdentity()),
    getProfile: () => toPublicAnchorProfile(shell.getProfile()),
    getAppInfo,
  };
}

export function createMessagingNamespace(
  shell: IShell,
  pluginId: string,
  logger: Logger,
): IMessagingNamespace {
  const messageBus = shell.getMessageBus();
  const sendMessage: MessageSender = async (channel, message, options) => {
    return messageBus.send(
      channel,
      message,
      pluginId,
      undefined,
      undefined,
      options?.broadcast,
    );
  };

  return {
    send: sendMessage,
    subscribe: <T = unknown, R = unknown>(
      channelOrName: string | Channel<T, R>,
      handler: MessageHandler<T, R> | TypedMessageHandler<T, R>,
    ): (() => void) => {
      if (isChannel(channelOrName)) {
        const channel = channelOrName;
        const typedHandler = handler as TypedMessageHandler<T, R>;

        const wrappedHandler: MessageHandler<unknown, R> = async (message) => {
          const parseResult = channel.schema.safeParse(message.payload);
          if (!parseResult.success) {
            logger.warn(`Invalid payload for channel ${channel.name}`, {
              error: parseResult.error.message,
            });
            return { noop: true };
          }

          const { payload: _payload, ...baseMessage } = message;
          return typedHandler(parseResult.data as T, baseMessage);
        };

        return messageBus.subscribe(channel.name, wrappedHandler);
      }

      return messageBus.subscribe(
        channelOrName,
        handler as MessageHandler<T, R>,
      );
    },
  };
}

export function createJobsNamespace(
  shell: IShell,
  pluginId: string,
): JobsNamespace {
  const jobQueueService = shell.getJobQueueService();
  return {
    ...shell.jobs,
    enqueue: createEnqueueJobFn(jobQueueService, pluginId, true),
    enqueueBatch: createEnqueueBatchFn(shell.jobs, pluginId),
    registerHandler: createRegisterHandlerFn(jobQueueService, pluginId),
  };
}

export function createConversationsNamespace(
  shell: IShell,
): IConversationsNamespace {
  return {
    get: async (conversationId: string): Promise<Conversation | null> => {
      const conversationService = shell.getConversationService();
      const conversation =
        await conversationService.getConversation(conversationId);
      return conversation ? toPublicConversation(conversation) : null;
    },
    search: async (query: string): Promise<Conversation[]> => {
      const conversationService = shell.getConversationService();
      const conversations =
        await conversationService.searchConversations(query);
      return conversations.map(toPublicConversation);
    },
    getMessages: async (
      conversationId: string,
      options?: GetMessagesOptions,
    ): Promise<Message[]> => {
      const conversationService = shell.getConversationService();
      const messages = await conversationService.getMessages(
        conversationId,
        options,
      );
      return messages.map(toPublicMessage);
    },
  };
}

export function createEvalNamespace(
  shell: IShell,
  pluginId: string,
): IEvalNamespace {
  return {
    registerHandler: (handlerId: string, handler: EvalHandler): void => {
      shell.registerEvalHandler(pluginId, handlerId, handler);
    },
  };
}

export function createInsightsNamespace(shell: IShell): IInsightsNamespace {
  return {
    register: (type: string, handler: InsightHandler): void => {
      shell.getInsightsRegistry().register(type, handler);
    },
  };
}

export function createEndpointsNamespace(
  shell: IShell,
  pluginId: string,
): IEndpointsNamespace {
  return {
    register: ({ label, url, priority = 100 }): void => {
      shell.registerEndpoint({ label, url, pluginId, priority });
    },
  };
}
