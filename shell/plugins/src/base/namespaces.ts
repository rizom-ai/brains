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
  IInteractionsNamespace,
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
  const sendMessage: MessageSender = async (request) => {
    return messageBus.send({
      ...request,
      sender: pluginId,
    });
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
    list: async (options): Promise<Conversation[]> => {
      const conversationService = shell.getConversationService();
      const conversations =
        await conversationService.listConversations(options);
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
    countMessages: async (conversationId: string): Promise<number> => {
      return shell.getConversationService().countMessages(conversationId);
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
    register: ({ label, url, priority = 100, visibility = "public" }): void => {
      shell.registerEndpoint({ label, url, pluginId, priority, visibility });
    },
  };
}

export function createInteractionsNamespace(
  shell: IShell,
  pluginId: string,
): IInteractionsNamespace {
  return {
    register: ({
      id,
      label,
      description,
      href,
      kind,
      priority = 100,
      visibility = "public",
      status = "available",
    }): void => {
      shell.registerInteraction({
        id,
        label,
        ...(description ? { description } : {}),
        href,
        kind,
        pluginId,
        priority,
        visibility,
        status,
      });
    },
  };
}
