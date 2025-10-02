import type { IShell } from "../interfaces";
import type { DefaultQueryResponse } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { MessageHandler, MessageSender } from "@brains/messaging-service";
import type { Template } from "@brains/templates";
import type { ICoreEntityService } from "@brains/entity-service";
import type { Batch, BatchJobStatus, JobInfo } from "@brains/job-queue";
import type {
  Conversation,
  Message,
  MessageRole,
  GetMessagesOptions,
  ConversationMetadata,
} from "@brains/conversation-service";
import type { IdentityBody } from "@brains/identity-service";

/**
 * Core plugin context - provides basic services to core plugins
 */
export interface CorePluginContext {
  // Identity
  readonly pluginId: string;
  readonly logger: Logger;

  // Core entity service (read-only operations)
  readonly entityService: ICoreEntityService;

  // Brain identity
  getIdentity: () => IdentityBody;

  // App metadata
  getAppInfo: () => { model: string; version: string };

  // Inter-plugin messaging
  sendMessage: MessageSender;
  subscribe: <T = unknown, R = unknown>(
    channel: string,
    handler: MessageHandler<T, R>,
  ) => () => void;

  // Template operations (lightweight, no AI generation)
  formatContent: <T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ) => string;
  parseContent: <T = unknown>(templateName: string, content: string) => T;
  registerTemplates: (templates: Record<string, Template>) => void;

  // Query functionality (core shell operation)
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;

  // Job monitoring (read-only)
  getActiveJobs: (types?: string[]) => Promise<JobInfo[]>;
  getActiveBatches: () => Promise<Batch[]>;
  getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
  getJobStatus: (jobId: string) => Promise<JobInfo | null>;

  // Conversation service (read-only)
  getConversation: (conversationId: string) => Promise<Conversation | null>;
  searchConversations: (query: string) => Promise<Conversation[]>;
  getMessages: (
    conversationId: string,
    options?: GetMessagesOptions,
  ) => Promise<Message[]>;
  startConversation: (
    conversationId: string,
    interfaceType: string,
    channelId: string,
    metadata: ConversationMetadata,
  ) => Promise<string>;
  addMessage: (
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * Create a CorePluginContext from the shell
 */
export function createCorePluginContext(
  shell: IShell,
  pluginId: string,
): CorePluginContext {
  const messageBus = shell.getMessageBus();
  const contentService = shell.getContentService();
  const entityService = shell.getEntityService();
  const logger = shell.getLogger().child(pluginId);

  // Create a MessageSender that uses the messageBus
  const sendMessage: MessageSender = async (channel, message) => {
    return messageBus.send(channel, message, pluginId);
  };

  return {
    pluginId,
    logger,
    entityService,

    // Identity
    getIdentity: () => shell.getIdentity(),

    // App metadata
    getAppInfo: () => shell.getAppInfo(),

    // Messaging
    sendMessage,
    subscribe: <T = unknown, R = unknown>(
      channel: string,
      handler: MessageHandler<T, R>,
    ) => messageBus.subscribe(channel, handler),

    // Template operations using ContentGenerator
    formatContent: <T = unknown>(
      templateName: string,
      data: T,
      options?: { truncate?: number },
    ): string => {
      return contentService.formatContent(templateName, data, {
        ...options,
        pluginId,
      });
    },

    parseContent: <T = unknown>(templateName: string, content: string): T => {
      return contentService.parseContent(templateName, content, pluginId);
    },

    registerTemplates: (templates: Record<string, Template>): void => {
      shell.registerTemplates(templates, pluginId);
    },

    // Query functionality
    query: (
      prompt: string,
      context?: Record<string, unknown>,
    ): Promise<DefaultQueryResponse> => {
      return shell.query(prompt, context);
    },

    // Job monitoring
    getActiveJobs: (types?: string[]): Promise<JobInfo[]> => {
      return shell.getActiveJobs(types);
    },
    getActiveBatches: (): Promise<Batch[]> => {
      return shell.getActiveBatches();
    },
    getBatchStatus: (batchId: string): Promise<BatchJobStatus | null> => {
      return shell.getBatchStatus(batchId);
    },
    getJobStatus: (jobId: string): Promise<JobInfo | null> => {
      return shell.getJobStatus(jobId);
    },

    // Conversation service
    getConversation: async (
      conversationId: string,
    ): Promise<Conversation | null> => {
      const conversationService = shell.getConversationService();
      return conversationService.getConversation(conversationId);
    },
    searchConversations: async (query: string): Promise<Conversation[]> => {
      const conversationService = shell.getConversationService();
      return conversationService.searchConversations(query);
    },
    getMessages: async (
      conversationId: string,
      options?: GetMessagesOptions,
    ): Promise<Message[]> => {
      const conversationService = shell.getConversationService();
      return conversationService.getMessages(conversationId, options);
    },
    startConversation: async (
      conversationId: string,
      interfaceType: string,
      channelId: string,
      metadata: ConversationMetadata,
    ): Promise<string> => {
      const conversationService = shell.getConversationService();
      return conversationService.startConversation(
        conversationId,
        interfaceType,
        channelId,
        metadata,
      );
    },
    addMessage: async (
      conversationId: string,
      role: MessageRole,
      content: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> => {
      const conversationService = shell.getConversationService();
      await conversationService.addMessage(
        conversationId,
        role,
        content,
        metadata,
      );
    },
  };
}
