import { AIService, OnlineEmbeddingProvider } from "@brains/ai-service";
import { ContentService as ContentServiceClass } from "@brains/content-service";
import { ConversationService } from "@brains/conversation-service";
import { DataSourceRegistry } from "@brains/entity-service";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { JobQueueService } from "@brains/job-queue";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import { PluginManager } from "@brains/plugins";
import {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import type { Logger } from "@brains/utils";

import { DaemonRegistry } from "../daemon-registry";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import { initializeIdentityAndAgentServices } from "./identity-agent-services";
import { initializeJobServices } from "./job-services";
import {
  createAIModelConfig,
  createDatabaseConfig,
  createServiceLogger,
} from "./service-config";

export function createShellServices(options: {
  config: ShellConfig;
  dependencies: ShellDependencies | undefined;
  initializerLogger: Logger;
}): ShellServices {
  const { config, dependencies, initializerLogger } = options;
  initializerLogger.debug("Initializing Shell services");

  const logger = createServiceLogger(config, dependencies?.logger);
  const disposables: Array<() => void> = [];

  const embeddingService =
    dependencies?.embeddingService ??
    OnlineEmbeddingProvider.getInstance({
      apiKey: config.ai.apiKey,
      logger,
    });
  const aiService =
    dependencies?.aiService ??
    AIService.getInstance(createAIModelConfig(config), logger);
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
    new PermissionService(config.permissions, { spaces: config.spaces });
  const mcpService =
    dependencies?.mcpService ?? MCPService.getInstance(messageBus, logger);

  const jobQueueService =
    dependencies?.jobQueueService ??
    JobQueueService.getInstance(
      createDatabaseConfig(config.jobQueueDatabase),
      logger,
    );

  const entityService = EntityService.getInstance({
    embeddingService,
    entityRegistry,
    logger,
    jobQueueService,
    messageBus,
    dbConfig: createDatabaseConfig(config.database),
    embeddingDbConfig: createDatabaseConfig(config.embeddingDatabase),
  });

  const conversationService =
    dependencies?.conversationService ??
    ConversationService.getInstance(
      logger,
      messageBus,
      createDatabaseConfig(config.conversationDatabase),
    );

  const contentService =
    dependencies?.contentService ??
    new ContentServiceClass({
      logger,
      entityService,
      aiService,
      templateRegistry,
      dataSourceRegistry,
    });

  const {
    identityService,
    profileService,
    canonicalIdentityService,
    agentService,
  } = initializeIdentityAndAgentServices({
    config,
    entityService,
    entityRegistry,
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
    canonicalIdentityService,
    agentService,
  };
}
