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
  InMemoryDataSourceRegistry,
  ENTITY_RPC_SERVICE,
  EntityRegistry,
  PROJECTION_STORE_RPC_SERVICE,
  ProjectionStore,
  handleEntityRpcRequest,
  handleProjectionStoreRpcRequest,
  parseEntityRpcCall,
  type EntityRpcTransport,
  type ProjectionStoreRpcTransport,
} from "@brains/entity-service";
import {
  EntityServiceTag,
  createEntityServiceLayer,
} from "@brains/entity-service/effect";
import { ProfileKindRegistry } from "@brains/identity-service";
import { mapArgsToInput, MCPService } from "@brains/mcp-service";
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
import { BunSchedulerBackend } from "@brains/scheduler";
import {
  PermissionService,
  RenderService,
  InMemoryTemplateRegistry,
} from "@brains/templates";
import { Clock, Context } from "@brains/utils/effect";
import { z } from "@brains/utils/zod";
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
  LOCAL_DATABASE_CLI_SERVICE,
  LocalDatabaseRpcClient,
  LocalDatabaseRpcServer,
} from "../local-database-endpoint";
import { ProjectionRuntimeSupervisor } from "../projection-runtime-supervisor";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import type { ShellLifecycle } from "./shell-lifecycle";
import {
  resolveRuntimeProcessTopology,
  type LocalDatabaseEndpointConfig,
  type RuntimeProcessRole,
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

const localCliRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("command"),
    commandName: z.string().min(1),
    args: z.array(z.string()),
    flags: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    kind: z.literal("tool"),
    toolName: z.string().min(1),
    input: z.unknown(),
    confirm: z.boolean().optional(),
    permission: z.enum(["public", "trusted", "admin"]).optional(),
  }),
]);

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
  const topology = resolveRuntimeProcessTopology(processRole);
  initializerLogger.debug("Initializing Shell services");

  const logger = createServiceLogger(config, dependencies?.logger);
  const operationContext =
    dependencies?.operationContext ?? OperationContext.createFresh();
  if (options.localDatabaseEndpoint && topology.endpointRole === "none") {
    throw new Error("A local database endpoint requires a process role");
  }
  const localDatabaseServer =
    options.localDatabaseEndpoint && topology.endpointRole === "owner"
      ? new LocalDatabaseRpcServer({ config: options.localDatabaseEndpoint })
      : undefined;
  const localDatabaseClient =
    options.localDatabaseEndpoint && topology.endpointRole === "client"
      ? new LocalDatabaseRpcClient({
          config: options.localDatabaseEndpoint,
          getOperationScope: (): OperationScope | undefined =>
            operationContext.current(),
        })
      : undefined;
  const localDatabaseEndpoint = localDatabaseServer ?? localDatabaseClient;
  const createRemoteTransport = (
    service: string,
  ):
    | {
        initialize(): Promise<void>;
        request(
          payload: unknown,
          options?: { signal?: AbortSignal | undefined },
        ): Promise<unknown>;
        close(): void;
      }
    | undefined =>
    localDatabaseClient
      ? {
          initialize: () => localDatabaseClient.initialize(),
          request: (payload, requestOptions) =>
            localDatabaseClient.request(service, payload, requestOptions),
          close: () => undefined,
        }
      : undefined;
  const remoteJobQueueTransport: JobQueueRpcTransport | undefined =
    createRemoteTransport(JOB_QUEUE_RPC_SERVICE);
  const remoteRuntimeStateTransport: RuntimeStateRpcTransport | undefined =
    createRemoteTransport(RUNTIME_STATE_RPC_SERVICE);
  const remoteConversationTransport: ConversationRpcTransport | undefined =
    createRemoteTransport(CONVERSATION_RPC_SERVICE);
  const remoteEntityTransport: EntityRpcTransport | undefined =
    createRemoteTransport(ENTITY_RPC_SERVICE);
  const remoteProjectionTransport: ProjectionStoreRpcTransport | undefined =
    createRemoteTransport(PROJECTION_STORE_RPC_SERVICE);
  const registerOwnerHandler = (
    service: string,
    handler: (payload: unknown, signal: AbortSignal) => Promise<unknown>,
  ): void => {
    if (!localDatabaseServer) return;
    localDatabaseServer.register(service, (payload, context) => {
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
    dependencies?.templateRegistry ??
    InMemoryTemplateRegistry.createFresh(logger);
  const dataSourceRegistry =
    dependencies?.dataSourceRegistry ??
    InMemoryDataSourceRegistry.createFresh(logger);
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
    RuntimeUploadRegistry.createFresh({ dataDir: config.dataDir, logger });
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
  registerOwnerHandler(LOCAL_DATABASE_CLI_SERVICE, async (payload) => {
    const request = localCliRequestSchema.parse(payload);
    if (request.kind === "command") {
      const match = mcpService
        .getCliTools()
        .find(({ tool }) => tool.cli?.name === request.commandName);
      if (!match?.tool.cli) {
        const available = mcpService
          .getCliTools()
          .map(({ tool }) => tool.cli?.name)
          .filter(Boolean)
          .join(", ");
        throw new Error(
          `Unknown command: ${request.commandName}. Available: ${available}`,
        );
      }
      const input = mapArgsToInput(
        match.tool.inputSchema,
        request.args,
        request.flags,
      );
      return match.tool.handler(input, {
        interfaceType: "cli",
        actor: { kind: "service", serviceId: "brain-cli" },
        userPermissionLevel: "admin",
      });
    }

    const match = mcpService
      .listTools()
      .find(({ tool }) => tool.name === request.toolName);
    if (!match) throw new Error(`Tool not found: ${request.toolName}`);
    const context = {
      interfaceType: "cli",
      actor: { kind: "service" as const, serviceId: "brain-cli" },
      userPermissionLevel: request.permission ?? "admin",
    };
    let result = await match.tool.handler(request.input, context);
    if ("needsConfirmation" in result && request.confirm) {
      result = await match.tool.handler(result.args, context);
    }
    return result;
  });

  const jobServices = initializeJobServices({
    dependencies,
    jobQueueConfig: createDatabaseConfig(config.jobQueueDatabase),
    workerConcurrency: config.jobQueue.workerConcurrency,
    messageBus,
    operationContext,
    projectionAdmission: projectionRuntimeSupervisor,
    handlerRegistrationMode: topology.jobHandlerMode,
    progressMonitorMode: topology.progressMonitorMode,
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

  if (localDatabaseServer) {
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
      scheduler: new BunSchedulerBackend(),
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

  if (topology.ownsControlPlane) {
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
      ...(dependencies?.projectionRuntime?.now && {
        projectionNow: dependencies.projectionRuntime.now,
      }),
      dbConfig: createDatabaseConfig(config.database),
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
  registerOwnerHandler(ENTITY_RPC_SERVICE, (payload, signal) => {
    // A worker running a bulk mutation sends its batch scope with each call;
    // re-entering it here keeps those writes fenced against the batch.
    const call = parseEntityRpcCall(payload);
    const dispatch = (): Promise<unknown> =>
      handleEntityRpcRequest(entityService, call.request, signal);
    if (!call.batchScope) return dispatch();
    const projectionStore = entityService.getProjectionStore();
    if (!(projectionStore instanceof ProjectionStore)) {
      throw new Error(
        "Batch-scoped entity calls require the owner's local projection store",
      );
    }
    return projectionStore.runInBatchScope(call.batchScope, dispatch);
  });
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
    executionOnly: topology.executionOnly,
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
