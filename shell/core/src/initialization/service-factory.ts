import { AIService, OnlineEmbeddingProvider } from "@brains/ai-service";
import { ContentService as ContentServiceClass } from "@brains/content-service";
import {
  CONVERSATION_RPC_SERVICE,
  handleConversationRpcRequest,
  type ConversationRpcTransport,
} from "@brains/conversation-service";
import {
  ConversationServiceTag,
  createConversationServiceLayer,
} from "@brains/conversation-service/effect";
import {
  DataSourceRegistry,
  ENTITY_RPC_SERVICE,
  EntityRegistry,
  PROJECTION_STORE_RPC_SERVICE,
  handleEntityRpcRequest,
  handleProjectionStoreRpcRequest,
  type EntityRpcTransport,
  type ProjectionStoreRpcTransport,
} from "@brains/entity-service";
import {
  EntityServiceTag,
  createEntityServiceLayer,
} from "@brains/entity-service/effect";
import { ProfileKindRegistry } from "@brains/identity-service";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import {
  AccountSettingsRegistry,
  AttachmentRegistry,
  ChannelRegistry,
  InboxFollowUpRegistry,
  InboxRegistry,
  OperationalHealthRegistry,
  PluginManager,
  RuntimeUploadRegistry,
} from "@brains/plugins";
import { RecurringCheckService } from "@brains/recurring-checks";
import {
  RUNTIME_STATE_RPC_SERVICE,
  handleRuntimeStateRpcRequest,
  type RuntimeStateRpcTransport,
} from "@brains/runtime-state";
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
import {
  OperationContext,
  type OperationScope,
} from "@brains/operation-context";
import {
  JOB_QUEUE_RPC_SERVICE,
  type JobQueueRpcTransport,
} from "@brains/job-queue";

import { DaemonRegistry } from "../daemon-registry";
import {
  LocalDatabaseRpcClient,
  LocalDatabaseRpcServer,
} from "../local-database-endpoint";
import { ProjectionRuntimeSupervisor } from "../projection-runtime-supervisor";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import type { ShellLifecycle } from "./shell-lifecycle";
import type {
  LocalDatabaseEndpointConfig,
  RuntimeProcessRole,
} from "../runtime-process-role";
import { initializeIdentityAndAgentServices } from "./identity-agent-services";
import { initializeJobServices } from "./job-services";
import { createRecurringCheckDelivery } from "./recurring-check-delivery";
import { createRecurringCheckInboxSource } from "./recurring-check-inbox-source";
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
  processRole?: RuntimeProcessRole;
  localDatabaseEndpoint?: LocalDatabaseEndpointConfig;
}): ShellServices {
  const { config, dependencies, initializerLogger, lifecycle, processRole } =
    options;
  initializerLogger.debug("Initializing Shell services");

  const logger = createServiceLogger(config, dependencies?.logger);
  const operationContext =
    dependencies?.operationContext ?? OperationContext.createFresh();
  if (options.localDatabaseEndpoint && !processRole) {
    throw new Error("A local database endpoint requires a process role");
  }
  const localDatabaseEndpoint = options.localDatabaseEndpoint
    ? processRole === "web"
      ? new LocalDatabaseRpcServer({ config: options.localDatabaseEndpoint })
      : new LocalDatabaseRpcClient({
          config: options.localDatabaseEndpoint,
          getOperationScope: (): OperationScope | undefined =>
            operationContext.current(),
        })
    : undefined;
  if (localDatabaseEndpoint instanceof LocalDatabaseRpcClient) {
    // Worker runtime drains before its shared endpoint client closes.
    lifecycle.addFinalizer(() => localDatabaseEndpoint.close());
  }
  const remoteJobQueueTransport: JobQueueRpcTransport | undefined =
    localDatabaseEndpoint instanceof LocalDatabaseRpcClient
      ? {
          initialize: () => localDatabaseEndpoint.initialize(),
          request: (payload, requestOptions) =>
            localDatabaseEndpoint.request(
              JOB_QUEUE_RPC_SERVICE,
              payload,
              requestOptions,
            ),
          close: () => undefined,
        }
      : undefined;
  const remoteRuntimeStateTransport: RuntimeStateRpcTransport | undefined =
    localDatabaseEndpoint instanceof LocalDatabaseRpcClient
      ? {
          initialize: () => localDatabaseEndpoint.initialize(),
          request: (payload, requestOptions) =>
            localDatabaseEndpoint.request(
              RUNTIME_STATE_RPC_SERVICE,
              payload,
              requestOptions,
            ),
          close: () => undefined,
        }
      : undefined;
  const remoteConversationTransport: ConversationRpcTransport | undefined =
    localDatabaseEndpoint instanceof LocalDatabaseRpcClient
      ? {
          initialize: () => localDatabaseEndpoint.initialize(),
          request: (payload, requestOptions) =>
            localDatabaseEndpoint.request(
              CONVERSATION_RPC_SERVICE,
              payload,
              requestOptions,
            ),
          close: () => undefined,
        }
      : undefined;
  const remoteEntityTransport: EntityRpcTransport | undefined =
    localDatabaseEndpoint instanceof LocalDatabaseRpcClient
      ? {
          initialize: () => localDatabaseEndpoint.initialize(),
          request: (payload, requestOptions) =>
            localDatabaseEndpoint.request(
              ENTITY_RPC_SERVICE,
              payload,
              requestOptions,
            ),
          close: () => undefined,
        }
      : undefined;
  const remoteProjectionTransport: ProjectionStoreRpcTransport | undefined =
    localDatabaseEndpoint instanceof LocalDatabaseRpcClient
      ? {
          initialize: () => localDatabaseEndpoint.initialize(),
          request: (payload, requestOptions) =>
            localDatabaseEndpoint.request(
              PROJECTION_STORE_RPC_SERVICE,
              payload,
              requestOptions,
            ),
          close: () => undefined,
        }
      : undefined;
  const registerOwnerHandler = (
    service: string,
    handler: (payload: unknown, signal: AbortSignal) => Promise<unknown>,
  ): void => {
    if (!(localDatabaseEndpoint instanceof LocalDatabaseRpcServer)) return;
    localDatabaseEndpoint.register(service, (payload, context) => {
      const invoke = (): Promise<unknown> => handler(payload, context.signal);
      return context.scope
        ? operationContext.run(
            context.scope.provenance,
            context.scope.operationId,
            invoke,
          )
        : invoke();
    });
  };
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
  const messageBus =
    dependencies?.messageBus ??
    MessageBus.createFresh(logger, operationContext);
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
  const profileKindRegistry =
    dependencies?.profileKindRegistry ??
    new ProfileKindRegistry(config.profileKind);
  const channelRegistry =
    dependencies?.channelRegistry ?? new ChannelRegistry();
  const inboxRegistry = dependencies?.inboxRegistry ?? new InboxRegistry();
  const inboxFollowUpRegistry =
    dependencies?.inboxFollowUpRegistry ?? new InboxFollowUpRegistry(logger);
  const operationalHealthRegistry =
    dependencies?.operationalHealthRegistry ?? new OperationalHealthRegistry();
  const accountSettingsRegistry =
    dependencies?.accountSettingsRegistry ?? new AccountSettingsRegistry();
  const attachmentRegistry =
    dependencies?.attachmentRegistry ?? AttachmentRegistry.createFresh();
  const runtimeUploadRegistry =
    dependencies?.runtimeUploadRegistry ??
    RuntimeUploadRegistry.createFresh({ dataDir: config.dataDir });
  const runtimeStateContext = lifecycle.buildLayer(
    createRuntimeStateServiceLayer({
      config: createDatabaseConfig(config.runtimeStateDatabase),
      logger,
      ...(remoteRuntimeStateTransport && {
        remoteTransport: remoteRuntimeStateTransport,
      }),
      ...(dependencies?.runtimeStateService && {
        service: dependencies.runtimeStateService,
      }),
    }),
  );
  const runtimeStateService = Context.get(
    runtimeStateContext,
    RuntimeStateServiceTag,
  );
  registerOwnerHandler(RUNTIME_STATE_RPC_SERVICE, (payload, signal) =>
    handleRuntimeStateRpcRequest(runtimeStateService, payload, signal),
  );
  const projectionRuntimeSupervisor =
    dependencies?.projectionRuntimeSupervisor ??
    ProjectionRuntimeSupervisor.createFresh(operationContext, {
      runtimeState: runtimeStateService,
    });

  const mcpService =
    dependencies?.mcpService ?? MCPService.createFresh(messageBus, logger);

  const jobServices = initializeJobServices({
    dependencies,
    jobQueueConfig: createDatabaseConfig(config.jobQueueDatabase),
    workerConcurrency: config.jobQueue.workerConcurrency,
    messageBus,
    operationContext,
    projectionAdmission: projectionRuntimeSupervisor,
    handlerRegistrationMode:
      processRole === "web"
        ? "validation-only"
        : processRole === "worker"
          ? "execution-only"
          : "combined",
    progressMonitorMode:
      processRole === "web"
        ? "durable-reader"
        : processRole === "worker"
          ? "durable-writer"
          : "combined",
    ...(remoteJobQueueTransport && {
      remoteTransport: remoteJobQueueTransport,
    }),
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

  if (localDatabaseEndpoint instanceof LocalDatabaseRpcServer) {
    const handleRequest = jobServices.handleRpcRequest;
    if (!handleRequest) {
      throw new Error("The web-owned job queue does not expose RPC dispatch");
    }
    registerOwnerHandler(JOB_QUEUE_RPC_SERVICE, (payload, signal) =>
      handleRequest(payload, signal),
    );
  }

  const recurringCheckService =
    dependencies?.recurringCheckService ??
    new RecurringCheckService({
      brainId: config.siteBaseUrl ?? config.dataDir,
      scheduler: new CronerBackend(),
      runtimeState: runtimeStateService,
      clock: Clock.make(),
      jobQueue: jobQueueService,
      logger,
      delivery: createRecurringCheckDelivery(messageBus),
    });
  lifecycle.addSyncFinalizer(() => recurringCheckService.abandon());
  inboxRegistry.registerSource(
    "shell.recurring-checks",
    createRecurringCheckInboxSource(recurringCheckService),
  );
  lifecycle.addSyncFinalizer(() =>
    inboxRegistry.unregisterPlugin("shell.recurring-checks"),
  );

  if (processRole !== "worker") {
    const recurringDaemonName = "shell:recurring-checks";
    daemonRegistry.register(
      recurringDaemonName,
      {
        start: () => recurringCheckService.start(),
        stop: () => recurringCheckService.stop(),
      },
      "shell",
    );
    lifecycle.addSyncFinalizer(() =>
      daemonRegistry.abandon(recurringDaemonName),
    );
  }

  const entityContext = lifecycle.buildLayer(
    createEntityServiceLayer({
      embeddingService,
      embeddingsEnabled: config.embedding.enabled,
      entityRegistry,
      logger,
      jobQueueService,
      messageBus,
      mutationAdmission: projectionRuntimeSupervisor,
      dbConfig: createDatabaseConfig(config.database),
      embeddingDbConfig: createDatabaseConfig(config.embeddingDatabase),
      ...(remoteEntityTransport && {
        remoteTransport: remoteEntityTransport,
      }),
      ...(remoteProjectionTransport && {
        projectionTransport: remoteProjectionTransport,
      }),
      ...(dependencies?.entityService && {
        service: dependencies.entityService,
      }),
    }),
  );
  const entityService = Context.get(entityContext, EntityServiceTag);
  registerOwnerHandler(ENTITY_RPC_SERVICE, (payload, signal) =>
    handleEntityRpcRequest(entityService, payload, signal),
  );
  registerOwnerHandler(PROJECTION_STORE_RPC_SERVICE, (payload, signal) =>
    handleProjectionStoreRpcRequest(
      entityService.getProjectionStore(),
      payload,
      signal,
    ),
  );

  const conversationContext = lifecycle.buildLayer(
    createConversationServiceLayer({
      dbConfig: createDatabaseConfig(config.conversationDatabase),
      logger,
      messageBus,
      ...(remoteConversationTransport && {
        remoteTransport: remoteConversationTransport,
      }),
      ...(dependencies?.conversationService && {
        service: dependencies.conversationService,
      }),
    }),
  );
  const conversationService = Context.get(
    conversationContext,
    ConversationServiceTag,
  );
  registerOwnerHandler(CONVERSATION_RPC_SERVICE, (payload, signal) =>
    handleConversationRpcRequest(conversationService, payload, signal),
  );

  if (localDatabaseEndpoint instanceof LocalDatabaseRpcServer) {
    // Shell runtime finalizers are registered later and therefore run first.
    // Then reject and drain remote traffic before any owner database scope.
    lifecycle.addFinalizer(() => localDatabaseEndpoint.close());
  }

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
    executionOnly: processRole === "worker",
  });

  return {
    logger,
    operationContext,
    localDatabaseEndpoint,
    projectionRuntimeSupervisor,
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
    profileKindRegistry,
    channelRegistry,
    inboxRegistry,
    inboxFollowUpRegistry,
    operationalHealthRegistry,
    accountSettingsRegistry,
    agentService,
    attachmentRegistry,
    runtimeUploadRegistry,
    runtimeStateService,
    recurringCheckService,
  };
}
