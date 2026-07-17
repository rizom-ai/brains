import { AIService, OnlineEmbeddingProvider } from "@brains/ai-service";
import { ContentService as ContentServiceClass } from "@brains/content-service";
import {
  ConversationServiceTag,
  createConversationServiceLayer,
} from "@brains/conversation-service/effect";
import { DataSourceRegistry, EntityRegistry } from "@brains/entity-service";
import {
  EntityServiceTag,
  createEntityServiceLayer,
} from "@brains/entity-service/effect";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import {
  NOTIFICATIONS_SEND,
  sendNotificationResultSchema,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/notification-contracts";
import {
  AttachmentRegistry,
  PluginManager,
  RuntimeUploadRegistry,
} from "@brains/plugins";
import { RecurringCheckService } from "@brains/recurring-checks";
import {
  RuntimeStateServiceTag,
  createRuntimeStateServiceLayer,
} from "@brains/runtime-state/effect";
import { CronerBackend } from "@brains/scheduler";
import {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import { Clock, Context } from "@brains/utils/effect";
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

  const recurringCheckService =
    dependencies?.recurringCheckService ??
    new RecurringCheckService({
      brainId: config.siteBaseUrl ?? config.dataDir,
      scheduler: new CronerBackend(),
      runtimeState: runtimeStateService,
      clock: Clock.make(),
      jobQueue: jobQueueService,
      logger,
      delivery: {
        deliver: async (alert): Promise<void> => {
          const response = await messageBus.send<
            SendNotificationInput,
            SendNotificationResult
          >({
            type: NOTIFICATIONS_SEND,
            payload: {
              title: alert.title,
              body: alert.body,
              ...(alert.html ? { html: alert.html } : {}),
            },
            sender: "shell.recurring-checks",
          });
          if (!("success" in response) || !response.success || !response.data) {
            throw new Error("Recurring alert delivery failed");
          }
          const result = sendNotificationResultSchema.safeParse(response.data);
          if (!result.success || result.data.status !== "sent") {
            throw new Error("Recurring alert delivery failed");
          }
        },
      },
    });
  lifecycle.addSyncFinalizer(() => recurringCheckService.abandon());

  const recurringDaemonName = "shell:recurring-checks";
  daemonRegistry.register(
    recurringDaemonName,
    {
      start: () => recurringCheckService.start(),
      stop: () => recurringCheckService.stop(),
    },
    "shell",
  );
  lifecycle.addSyncFinalizer(() => daemonRegistry.abandon(recurringDaemonName));

  const entityContext = lifecycle.buildLayer(
    createEntityServiceLayer({
      embeddingService,
      entityRegistry,
      logger,
      jobQueueService,
      messageBus,
      dbConfig: createDatabaseConfig(config.database),
      embeddingDbConfig: createDatabaseConfig(config.embeddingDatabase),
      ...(dependencies?.entityService && {
        service: dependencies.entityService,
      }),
    }),
  );
  const entityService = Context.get(entityContext, EntityServiceTag);

  const conversationContext = lifecycle.buildLayer(
    createConversationServiceLayer({
      dbConfig: createDatabaseConfig(config.conversationDatabase),
      logger,
      messageBus,
      ...(dependencies?.conversationService && {
        service: dependencies.conversationService,
      }),
    }),
  );
  const conversationService = Context.get(
    conversationContext,
    ConversationServiceTag,
  );

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
    recurringCheckService,
  };
}
