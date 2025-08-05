import type { IShell, DefaultQueryResponse } from "../interfaces";
import type { Logger } from "@brains/utils";
import type { MessageHandler, MessageSender } from "@brains/messaging-service";
import type { Template } from "@brains/content-generator";
import type { ICoreEntityService } from "@brains/entity-service";
import type { Batch, BatchJobStatus } from "@brains/job-queue";
import type { JobQueue } from "@brains/db";

/**
 * Core plugin context - provides basic services to core plugins
 */
export interface CorePluginContext {
  // Identity
  readonly pluginId: string;
  readonly logger: Logger;

  // Core entity service (read-only operations)
  readonly entityService: ICoreEntityService;

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
  getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  getActiveBatches: () => Promise<Batch[]>;
  getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
  getJobStatus: (jobId: string) => Promise<JobQueue | null>;
}

/**
 * Create a CorePluginContext from the shell
 */
export function createCorePluginContext(
  shell: IShell,
  pluginId: string,
): CorePluginContext {
  const messageBus = shell.getMessageBus();
  const contentGenerator = shell.getContentGenerator();
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
      return contentGenerator.formatContent(templateName, data, {
        ...options,
        pluginId,
      });
    },

    parseContent: <T = unknown>(templateName: string, content: string): T => {
      return contentGenerator.parseContent(templateName, content, pluginId);
    },

    registerTemplates: (templates: Record<string, Template>): void => {
      shell.registerTemplates(templates, pluginId);
    },

    // Query functionality
    query: (prompt: string, context?: Record<string, unknown>) => {
      return shell.query(prompt, context);
    },

    // Job monitoring
    getActiveJobs: (types?: string[]) => {
      return shell.getActiveJobs(types);
    },
    getActiveBatches: () => {
      return shell.getActiveBatches();
    },
    getBatchStatus: (batchId: string) => {
      return shell.getBatchStatus(batchId);
    },
    getJobStatus: (jobId: string) => {
      return shell.getJobStatus(jobId);
    },
  };
}
