import type { GetMessagesOptions } from "@brains/conversation-service";
import type { JobsNamespace } from "@brains/job-queue";
import {
  createEnqueueBatchFn,
  createEnqueueJobFn,
  createRegisterHandlerFn,
} from "@brains/job-queue";
import type { MessageHandler, MessageSender } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";
import type { AppInfo } from "../contracts/app-info";
import type { Conversation, Message } from "../contracts/conversations";
import type { IShell } from "../interfaces";
import type { EvalHandler, InsightHandler } from "../contracts/handlers";
import type { Channel } from "../utils/channels";
import { isChannel } from "../utils/channels";
import { toPublicAppInfo } from "./public-app-info";
import { toPublicConversation, toPublicMessage } from "./public-conversations";
import {
  toPublicAnchorProfile,
  toPublicBrainCharacter,
} from "./public-identity";
import type {
  IChannelsNamespace,
  IConversationsNamespace,
  IEndpointsNamespace,
  IEvalNamespace,
  IIdentityNamespace,
  IInboxFollowUpsNamespace,
  IInboxNamespace,
  IInsightsNamespace,
  IInteractionsNamespace,
  IMessageInterfaceChannelsNamespace,
  IMessagingNamespace,
  IOperationalHealthNamespace,
  IPermissionsNamespace,
  IPluginsNamespace,
  IProfileKindsNamespace,
  TypedMessageHandler,
} from "./context-types";

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

export function createProfileKindsNamespace(
  shell: IShell,
  pluginId: string,
): IProfileKindsNamespace {
  const registry = shell.getProfileKindRegistry();
  return {
    register: (definition): void => {
      registry.register(pluginId, definition);
    },
    getResolved: () => registry.getResolved(),
    getSelectedDefinition: () => registry.getSelectedDefinition(),
  };
}

export function createChannelsNamespace(shell: IShell): IChannelsNamespace {
  const registry = shell.getChannelRegistry();
  return {
    listDescriptors: () => registry.listDescriptors(),
    getDescriptor: (channelType) => registry.getDescriptor(channelType),
    getDeliveryProvider: (channelType) =>
      registry.getDeliveryProvider(channelType),
  };
}

export function createOperationalHealthNamespace(
  shell: IShell,
  pluginId: string,
): IOperationalHealthNamespace {
  const registry = shell.getOperationalHealthRegistry();
  return {
    register: (name, provider): (() => void) =>
      registry.register(pluginId, name, provider),
  };
}

export function createInboxNamespace(
  shell: IShell,
  pluginId: string,
): IInboxNamespace {
  const registry = shell.getInboxRegistry();
  return {
    registerSource: (source): void => {
      registry.registerSource(pluginId, source);
    },
    listSources: () => registry.listSources(),
    getSource: (sourceId) => registry.getSource(sourceId),
  };
}

export function createInboxFollowUpsNamespace(
  shell: IShell,
  pluginId: string,
): IInboxFollowUpsNamespace {
  const registry = shell.getInboxFollowUpRegistry();
  return {
    registerKind: (registration): void => {
      registry.registerKind(pluginId, registration);
    },
    listKinds: () => registry.listKinds(),
    getKind: (kind) => registry.getKind(kind),
    resolve: (input) => registry.resolve(input),
    resolveUniversal: (input) => registry.resolveUniversal(input),
  };
}

export function createMessageInterfaceChannelsNamespace(
  shell: IShell,
  pluginId: string,
): IMessageInterfaceChannelsNamespace {
  const registry = shell.getChannelRegistry();
  return {
    ...createChannelsNamespace(shell),
    registerDescriptor: (descriptor): void => {
      registry.registerDescriptor(pluginId, descriptor);
    },
    registerDeliveryProvider: (provider): void => {
      registry.registerDeliveryProvider(pluginId, provider);
    },
  };
}

export function createMessagingNamespace(
  shell: IShell,
  pluginId: string,
  logger: Logger,
  executionOnly: boolean = false,
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
      if (executionOnly) return () => {};
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
    subscribeExecution: <T = unknown, R = unknown>(
      channel: string,
      handler: MessageHandler<T, R>,
    ): (() => void) => messageBus.subscribe(channel, handler),
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

export function createPermissionsNamespace(
  shell: IShell,
): IPermissionsNamespace {
  const permissionService = shell.getPermissionService();
  return {
    assertEntityActionAllowed: (entityType, action, context): void => {
      permissionService.assertEntityActionAllowed(
        entityType,
        action,
        context.userPermissionLevel,
      );
    },
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

export function createPluginsNamespace(shell: IShell): IPluginsNamespace {
  return {
    has: (pluginId): boolean =>
      shell.getPluginPackageName(pluginId) !== undefined,
  };
}

export function createEndpointsNamespace(
  shell: IShell,
  pluginId: string,
): IEndpointsNamespace {
  return {
    register: (endpoint): void => {
      shell.registerEndpoint({ ...endpoint, pluginId });
    },
  };
}

export function createInteractionsNamespace(
  shell: IShell,
  pluginId: string,
): IInteractionsNamespace {
  return {
    register: (interaction): void => {
      shell.registerInteraction({ ...interaction, pluginId });
    },
  };
}
