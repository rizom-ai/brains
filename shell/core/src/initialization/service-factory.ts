import { AIService, OnlineEmbeddingProvider } from "@brains/ai-service";
import type { AIModelConfig } from "@brains/ai-service";
import { ContentService as ContentServiceClass } from "@brains/content-service";
import { ConversationService } from "@brains/conversation-service";
import { DataSourceRegistry } from "@brains/entity-service";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { JobQueueService, type JobQueueDbConfig } from "@brains/job-queue";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import { PluginManager } from "@brains/plugins";
import {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import { Logger, LogLevel } from "@brains/utils";

import { DaemonRegistry } from "../daemon-registry";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import { initializeIdentityAndAgentServices } from "./identity-agent-services";
import { initializeJobServices } from "./job-services";

export function createShellServices(options: {
  config: ShellConfig;
  dependencies: ShellDependencies | undefined;
  initializerLogger: Logger;
}): ShellServices {
  const { config, dependencies, initializerLogger } = options;
  initializerLogger.debug("Initializing Shell services");

  const logLevel = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  }[config.logging.level];

  const logger =
    dependencies?.logger ??
    Logger.createFresh({
      level: logLevel,
      context: config.logging.context,
      format: config.logging.format === "json" ? "json" : "text",
      ...(config.logging.file ? { logFile: config.logging.file } : {}),
    });
  const disposables: Array<() => void> = [];

  const embeddingService =
    dependencies?.embeddingService ??
    OnlineEmbeddingProvider.getInstance({
      apiKey: config.ai.apiKey,
      logger,
    });
  const aiConfig: AIModelConfig = {
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    temperature: config.ai.temperature,
    maxTokens: config.ai.maxTokens,
    webSearch: config.ai.webSearch,
    ...(config.ai.imageApiKey ? { imageApiKey: config.ai.imageApiKey } : {}),
  };
  const aiService =
    dependencies?.aiService ?? AIService.getInstance(aiConfig, logger);
  const entityRegistry = EntityRegistry.getInstance(logger);
  const messageBus = dependencies?.messageBus ?? MessageBus.getInstance(logger);
  const templateRegistry =
    dependencies?.templateRegistry ?? TemplateRegistry.getInstance(logger);
  const dataSourceRegistry =
    dependencies?.dataSourceRegistry ?? DataSourceRegistry.getInstance(logger);
  const renderService =
    dependencies?.renderService ?? RenderService.getInstance(templateRegistry);
  const daemonRegistry =
    dependencies?.daemonRegistry ?? DaemonRegistry.getInstance(logger);
  const pluginManager =
    dependencies?.pluginManager ??
    PluginManager.getInstance(logger, daemonRegistry);
  const permissionService =
    dependencies?.permissionService ??
    new PermissionService(config.permissions);
  const mcpService =
    dependencies?.mcpService ?? MCPService.getInstance(messageBus, logger);

  const jobQueueDbConfig: JobQueueDbConfig = {
    url: config.jobQueueDatabase.url,
    ...(config.jobQueueDatabase.authToken && {
      authToken: config.jobQueueDatabase.authToken,
    }),
  };

  const jobQueueService =
    dependencies?.jobQueueService ??
    JobQueueService.getInstance(jobQueueDbConfig, logger);

  const entityService = EntityService.getInstance({
    embeddingService,
    entityRegistry,
    logger,
    jobQueueService,
    messageBus,
    dbConfig: {
      url: config.database.url,
      ...(config.database.authToken && {
        authToken: config.database.authToken,
      }),
    },
    embeddingDbConfig: {
      url: config.embeddingDatabase.url,
      ...(config.embeddingDatabase.authToken && {
        authToken: config.embeddingDatabase.authToken,
      }),
    },
  });

  const conversationService =
    dependencies?.conversationService ??
    ConversationService.getInstance(logger, messageBus, {
      url: config.conversationDatabase.url,
      ...(config.conversationDatabase.authToken && {
        authToken: config.conversationDatabase.authToken,
      }),
    });

  const contentService =
    dependencies?.contentService ??
    new ContentServiceClass({
      logger,
      entityService,
      aiService,
      templateRegistry,
      dataSourceRegistry,
    });

  const { identityService, profileService, agentService } =
    initializeIdentityAndAgentServices({
      config,
      entityService,
      logger,
      messageBus,
      aiService,
      mcpService,
      conversationService,
      disposables,
    });

  const { batchJobManager, jobProgressMonitor, jobQueueWorker } =
    initializeJobServices({
      dependencies,
      jobQueueService,
      messageBus,
      logger,
    });

  return {
    logger,
    disposables,
    entityRegistry,
    messageBus,
    renderService,
    daemonRegistry,
    pluginManager,
    templateRegistry,
    dataSourceRegistry,
    mcpService,
    embeddingService,
    entityService,
    aiService,
    conversationService,
    contentService,
    jobQueueService,
    jobQueueWorker,
    batchJobManager,
    jobProgressMonitor,
    permissionService,
    identityService,
    profileService,
    agentService,
  };
}
