import { AIService, OnlineEmbeddingProvider } from "@brains/ai-service";
import { ContentService as ContentServiceClass } from "@brains/content-service";
import { ConversationService } from "@brains/conversation-service";
import {
  DataSourceRegistry,
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import {
  AttachmentRegistry,
  PluginManager,
  RuntimeUploadRegistry,
} from "@brains/plugins";
import {
  RuntimeStateServiceTag,
  createRuntimeStateServiceLayer,
} from "@brains/runtime-state/effect";
import {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import { Context } from "@brains/utils/effect";
import type { Logger } from "@brains/utils/logger";

import { DaemonRegistry } from "../daemon-registry";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import type { ShellLifecycle } from "./shell-lifecycle";
import { initializeIdentityAndAgentServices } from "./identity-agent-services";
import { initializeJobServices } from "./job-services";
import {
  createAIModelConfig,
  createDatabaseConfig,
  createServiceLogger,
} from "./service-config";

function isCloseableEntityService(
  service: IEntityService,
): service is IEntityService & { close(): void } {
  return "close" in service && typeof service.close === "function";
}

export function createShellServices(options: {
  config: ShellConfig;
  dependencies: ShellDependencies | undefined;
  initializerLogger: Logger;
  lifecycle: ShellLifecycle;
}): ShellServices {
  const { config, dependencies, initializerLogger, lifecycle } = options;
  initializerLogger.debug("Initializing Shell services");

  const logger = createServiceLogger(config, dependencies?.logger);
  const disposables: Array<() => void> = [];

  const embeddingService =
    dependencies?.embeddingService ??
    OnlineEmbeddingProvider.createFresh({
      apiKey: config.ai.apiKey,
      logger,
    });
  const aiService =
    dependencies?.aiService ??
    AIService.createFresh(createAIModelConfig(config), logger);
  const entityRegistry =
    dependencies?.entityRegistry ?? EntityRegistry.createFresh(logger);
  const messageBus = dependencies?.messageBus ?? MessageBus.createFresh(logger);
  const templateRegistry =
    dependencies?.templateRegistry ?? TemplateRegistry.createFresh(logger);
  const dataSourceRegistry =
    dependencies?.dataSourceRegistry ?? DataSourceRegistry.createFresh(logger);
  const renderService =
    dependencies?.renderService ?? RenderService.createFresh(templateRegistry);
  const daemonRegistry =
    dependencies?.daemonRegistry ?? DaemonRegistry.createFresh(logger);
  const pluginManager =
    dependencies?.pluginManager ??
    PluginManager.createFresh(logger, daemonRegistry);
  const permissionService =
    dependencies?.permissionService ??
    new PermissionService(config.permissions, { spaces: config.spaces });
  const attachmentRegistry =
    dependencies?.attachmentRegistry ?? AttachmentRegistry.createFresh();
  const runtimeUploadRegistry =
    dependencies?.runtimeUploadRegistry ??
    RuntimeUploadRegistry.createFresh({ dataDir: config.dataDir });
  const runtimeStateContext = lifecycle.buildLayer(
    createRuntimeStateServiceLayer({
      config: createDatabaseConfig(config.runtimeStateDatabase),
      logger,
      ...(dependencies?.runtimeStateService && {
        service: dependencies.runtimeStateService,
      }),
    }),
  );
  const runtimeStateService = Context.get(
    runtimeStateContext,
    RuntimeStateServiceTag,
  );

  const mcpService =
    dependencies?.mcpService ?? MCPService.createFresh(messageBus, logger);

  const jobServices = initializeJobServices({
    dependencies,
    jobQueueConfig: createDatabaseConfig(config.jobQueueDatabase),
    messageBus,
    logger,
  });
  const {
    batchJobManager,
    jobProgressMonitor,
    jobQueueService,
    jobQueueWorker,
  } = jobServices;
  lifecycle.addSyncFinalizer(() => jobServices.closeDatabase());
  lifecycle.addSyncFinalizer(() => jobServices.rollbackRuntime());

  const entityService =
    dependencies?.entityService ??
    EntityService.createFresh({
      embeddingService,
      entityRegistry,
      logger,
      jobQueueService,
      messageBus,
      dbConfig: createDatabaseConfig(config.database),
      embeddingDbConfig: createDatabaseConfig(config.embeddingDatabase),
    });
  if (isCloseableEntityService(entityService)) {
    lifecycle.addSyncFinalizer(() => entityService.close());
  }

  const conversationService =
    dependencies?.conversationService ??
    ConversationService.createFreshFromConfig(
      logger,
      messageBus,
      createDatabaseConfig(config.conversationDatabase),
    );
  lifecycle.addSyncFinalizer(() => conversationService.close());

  lifecycle.addSyncFinalizer(() => {
    for (const dispose of disposables.splice(0)) {
      try {
        dispose();
      } catch (error) {
        logger.warn("Failed to dispose shell subscription", error);
      }
    }
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
    runtimeUploadRegistry,
    disposables,
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
    jobServicesLifecycle: jobServices,
    permissionService,
    identityService,
    profileService,
    canonicalIdentityService,
    agentService,
    attachmentRegistry,
    runtimeUploadRegistry,
    runtimeStateService,
  };
}
