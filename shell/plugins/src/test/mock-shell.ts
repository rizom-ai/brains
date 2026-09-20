import {
  AccountSettingsRegistry,
  AttachmentRegistry,
  ChannelRegistry,
  InboxFollowUpRegistry,
  InboxRegistry,
  OperationalHealthRegistry,
  RuntimeUploadRegistry,
  createAttachmentsNamespace,
  createRuntimeUploadsNamespace,
} from "../index";
import { bindHttpRouteSnapshot } from "../internal/http-route-snapshot";
import type {
  IShell,
  Plugin,
  Tool,
  Resource,
  ResourceTemplate,
  Prompt,
  ContentGenerationConfig,
  QueryContext,
  EvalHandler,
  RegisteredApiRoute,
  RegisteredWebRoute,
  ToolInfo,
  IMCPTransport,
  RuntimeAppInfo,
  RuntimeReadiness,
  Daemon,
  EndpointInfo,
  EndpointInfoInput,
  InteractionInfo,
  InteractionInfoInput,
  IDaemonRegistry,
  IInsightsRegistry,
  InsightHandler,
} from "../index";
import type { RegisteredHttpRoute } from "../types/http-routes";
import type { Template } from "@brains/templates";
import { PermissionService } from "@brains/templates";
import type {
  MessageHandler,
  IMessageBus,
  MessageBusSendRequest,
  MessageResponse,
} from "@brains/messaging-service";
import { validateMessage } from "@brains/messaging-service";
import {
  authorizeGenerationWrite,
  planContentGeneration,
  submitContentGeneration,
  GenerationAuthorizer,
} from "@brains/content-service";
import type { IContentService, ContentTemplate } from "@brains/content-service";
import type { Logger } from "@brains/utils/logger";
import type { DefaultQueryResponse } from "@brains/contracts";
import { defaultQueryResponseSchema } from "@brains/contracts";
import {
  type IEntityService,
  type IEntityRegistry,
  type BaseEntity,
  type DataSourceRegistry,
  type DataSource,
  type EntityAdapter,
  type DataSourceCapabilities,
  type UploadSaveHandlerRegistration,
  type CreateInterceptor,
} from "@brains/entity-service";
import { createMockEntityStore } from "./mock-entity-store";
import { createMockEntityService } from "./mock-entity-service";
import type {
  IJobQueueService,
  IJobsNamespace,
  JobInfo,
  JobQueueEnqueueRequest,
} from "@brains/job-queue";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
import type { ViewTemplateRegistry } from "@brains/templates";
import type { IConversationService } from "@brains/conversation-service";
import { z } from "@brains/utils/zod";
import {
  ProfileKindRegistry,
  type BrainCharacter,
  type AnchorProfile,
} from "@brains/identity-service";
import type {
  AgentResponse,
  IAgentService,
  ImageGenerationOptions,
  ImageGenerationResult,
  JudgeInput,
  AIGenerationSchema,
} from "@brains/ai-service";
import { createSilentLogger } from "@brains/test-utils";

/**
 * MockShell type — IShell plus test helper methods.
 * All methods are mutable so tests can override them.
 */
export interface MockShell extends IShell {
  addEntities(entities: BaseEntity[]): void;
  clearEntities(): void;
  registerPlugin(plugin: Plugin): void;
  addPlugin(plugin: Plugin): void;
  getPlugin(pluginId: string): Plugin | undefined;
  getTemplates(): Map<string, Template>;
  setAgentService(agentService: IAgentService): void;
  setConversationService(conversationService: IConversationService): void;
  getDaemonRegistry(): IDaemonRegistry;
}

export interface MockShellOptions {
  logger?: Logger;
  agentService?: IAgentService;
  conversationService?: IConversationService;
  dataDir?: string;
  /** Where a fake checkout owner listens; undefined for a Brain without Git. */
  gitBrokerSocket?: string;
  /** Absolute checkout assigned with the fake broker. */
  gitBrokerCheckout?: string;
  /** Bare domain string (e.g. "yeehaa.io") for identity.getSiteUrl/getPreviewUrl */
  domain?: string;
  /** Local runtime site URL (e.g. "http://localhost:8080") */
  localSiteUrl?: string;
  /** Prefer local runtime URLs over public domain URLs */
  preferLocalUrls?: boolean;
  /** Shared conversation spaces */
  spaces?: string[];
  /** Optional composition-selected semantic profile kind */
  profileKind?: string;
  /** Active resolved theme CSS */
  themeCSS?: string;
  /** Replace the stateful in-memory entity fake with canned reads. */
  entityService?: IEntityService;
}

function createDefaultMockAgentService(): IAgentService {
  return {
    chat: async (): Promise<AgentResponse> => ({
      text: "Mock agent response",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    confirmPendingAction: async (): Promise<AgentResponse> => ({
      text: "Action confirmed.",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    invalidateAgent: (): void => {},
  };
}

export function createMemoryRuntimeStateNamespace(): IRuntimeStateNamespace {
  const namespaces = new Map<
    string,
    Map<string, { value: unknown; createdAt: Date; updatedAt: Date }>
  >();

  return {
    scoped: <T>(
      options: RuntimeStateScopeOptions<T>,
    ): IRuntimeStateStore<T> => {
      if (!namespaces.has(options.namespace)) {
        namespaces.set(options.namespace, new Map());
      }
      const records = namespaces.get(options.namespace);
      if (!records) throw new Error("Runtime state namespace missing");

      return {
        get: async (key): Promise<T | null> => {
          const record = records.get(key);
          return record ? options.schema.parse(record.value) : null;
        },
        has: async (key): Promise<boolean> => records.has(key),
        set: async (key, value): Promise<void> => {
          const parsed = options.schema.parse(value);
          const existing = records.get(key);
          const now = new Date();
          records.set(key, {
            value: parsed,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          });
        },
        setIfNotExists: async (key, value): Promise<boolean> => {
          if (records.has(key)) return false;
          const parsed = options.schema.parse(value);
          const now = new Date();
          records.set(key, { value: parsed, createdAt: now, updatedAt: now });
          return true;
        },
        compareAndSet: async (key, expected, value): Promise<boolean> => {
          const parsedExpected = options.schema.parse(expected);
          const parsedValue = options.schema.parse(value);
          const existing = records.get(key);
          if (
            !existing ||
            JSON.stringify(existing.value) !== JSON.stringify(parsedExpected)
          )
            return false;
          records.set(key, {
            ...existing,
            value: parsedValue,
            updatedAt: new Date(),
          });
          return true;
        },
        delete: async (key): Promise<boolean> => records.delete(key),
        list: async ({ keyPrefix, afterKey, limit } = {}): Promise<
          RuntimeStateRecordValue<T>[]
        > => {
          if (limit !== undefined)
            z.number().int().min(1).max(1000).parse(limit);
          return Array.from(records.entries())
            .filter(
              ([key]) =>
                (keyPrefix === undefined || key.startsWith(keyPrefix)) &&
                (afterKey === undefined ||
                  Buffer.compare(Buffer.from(key), Buffer.from(afterKey)) > 0),
            )
            .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
            .slice(0, limit)
            .map(([key, record]): RuntimeStateRecordValue<T> => ({
              key,
              value: options.schema.parse(record.value),
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
            }));
        },
        clear: async ({ keyPrefix } = {}): Promise<number> => {
          const keys = Array.from(records.keys()).filter(
            (key) => keyPrefix === undefined || key.startsWith(keyPrefix),
          );
          for (const key of keys) records.delete(key);
          return keys.length;
        },
      };
    },
  };
}

function createDefaultMockConversationService(): IConversationService {
  return {
    startConversation: async () => `conv-${Date.now()}`,
    addMessage: async (): Promise<void> => {},
    getMessages: async () => [],
    countMessages: async () => 0,
    getConversation: async () => null,
    listConversations: async () => [],
    searchConversations: async () => [],
    updateConversationMetadata: async () => false,
    deleteConversation: async () => false,
    deleteExpiredGuestConversations: async () => 0,
    close: (): void => {},
  };
}

/**
 * Create a mock Shell for testing plugins.
 *
 * Returns a plain object satisfying IShell + test helpers.
 * Stateful backing stores for entities, templates, data sources, and message handlers.
 * Methods can be reassigned in tests: `mockShell.registerTools = mock(...)`
 */
export function createMockShell(options: MockShellOptions = {}): MockShell {
  const logger = options.logger ?? createSilentLogger("MockShell");

  // Fresh registries per mock shell — keeps tests isolated from each other and
  // from process-wide singleton state.
  const attachmentRegistry = AttachmentRegistry.createFresh();
  const runtimeUploadRegistry = RuntimeUploadRegistry.createFresh({
    dataDir: options.dataDir ?? "/tmp/mock-shell-test-data",
  });
  const runtimeState = createMemoryRuntimeStateNamespace();
  const profileKindRegistry = new ProfileKindRegistry(options.profileKind);
  const channelRegistry = new ChannelRegistry();
  const inboxRegistry = new InboxRegistry();
  const inboxFollowUpRegistry = new InboxFollowUpRegistry();
  const operationalHealthRegistry = new OperationalHealthRegistry();
  const accountSettingsRegistry = new AccountSettingsRegistry();

  // Stateful backing stores. The entity state is one store shared by the
  // service double, the registry double and the message bus; the names below
  // alias into it rather than copying it, so all three still see one set of
  // entities.
  const entityStore = createMockEntityStore();
  const {
    entities,
    types: entityTypes,
    adapters: entityAdapters,
    typeConfigs: entityTypeConfigs,
  } = entityStore;
  const getEntityTypeConfig = entityStore.typeConfig;
  const templates = new Map<string, Template>();
  const dataSources = new Map<string, DataSource>();
  const plugins = new Map<string, Plugin>();
  const messageHandlers = new Map<
    string,
    Set<MessageHandler<unknown, unknown>>
  >();

  let agentService: IAgentService =
    options.agentService ?? createDefaultMockAgentService();
  let conversationService: IConversationService =
    options.conversationService ?? createDefaultMockConversationService();

  // --- Message Bus (stateful — plugins subscribe during register, tests send) ---
  const messageBus: IMessageBus = {
    send: async <T = unknown, R = unknown>(
      request: MessageBusSendRequest<T>,
    ): Promise<MessageResponse<R>> => {
      const { type, payload, sender, broadcast } = request;
      const handlers = messageHandlers.get(type) ?? new Set();
      let result: MessageResponse<unknown> = { success: true };
      for (const handler of handlers) {
        const response = await handler({
          type,
          payload,
          source: sender,
          id: `msg-${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
        if (broadcast) continue;
        result = response;
        break;
      }
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the bus is generic in its response type with no schema to check against; the fake stores erased handlers
      return result as MessageResponse<R>;
    },
    subscribe: <T = unknown, R = unknown>(
      type: string,
      handler: MessageHandler<T, R>,
    ): (() => void) => {
      const handlers =
        messageHandlers.get(type) ??
        new Set<MessageHandler<unknown, unknown>>();
      messageHandlers.set(type, handlers);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- erasing the handler is what lets one set hold every subscription
      const erased = handler as MessageHandler<unknown, unknown>;
      handlers.add(erased);
      return (): void => {
        messageHandlers.get(type)?.delete(erased);
      };
    },
    unsubscribe: (): void => {},
    hasHandlers: (messageType: string): boolean =>
      (messageHandlers.get(messageType)?.size ?? 0) > 0,
    getHandlerCount: (messageType: string): number =>
      messageHandlers.get(messageType)?.size ?? 0,
    // The fake does not model targeting, so every handler counts as untargeted.
    getTargetedHandlerCount: (): number => 0,
    clearHandlers: (messageType: string): void => {
      messageHandlers.delete(messageType);
    },
    clearAllHandlers: (): void => {
      messageHandlers.clear();
    },
    collect: async <T = unknown, R = unknown>(
      request: MessageBusSendRequest<T>,
    ): Promise<MessageResponse<R>[]> => {
      const handlers = messageHandlers.get(request.type) ?? new Set();
      return Promise.all(
        Array.from(handlers).map(
          async (handler) =>
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the note on send()
            (await handler({
              type: request.type,
              payload: request.payload,
              source: request.sender,
              id: `msg-${Date.now()}`,
              timestamp: new Date().toISOString(),
            })) as MessageResponse<R>,
        ),
      );
    },
    // The caller supplies the schema, so the fake can validate for real
    // rather than approximate it.
    validateMessage,
  };

  // --- Entity Service (stateful) ---
  const defaultEntityService = createMockEntityService(entityStore);

  // Tests that want canned reads rather than the stateful fake can inject
  // their own; everything built from this shell then sees the same service.
  const entityService = options.entityService ?? defaultEntityService;

  // --- Entity Registry ---
  const createInterceptors = new Map<string, CreateInterceptor>();
  const uploadSaveHandlers: UploadSaveHandlerRegistration[] = [];

  const entityRegistry: IEntityRegistry = {
    registerEntityType: (type, _schema, adapter, config) => {
      entityTypes.add(type);
      entityAdapters.set(type, adapter);
      entityTypeConfigs.set(type, config ?? {});
    },
    unregisterEntityType: (type): void => {
      entityTypes.delete(type);
      entityAdapters.delete(type);
      entityTypeConfigs.delete(type);
      createInterceptors.delete(type);
    },
    getSchema: (): never => {
      throw new Error("Not implemented");
    },
    getAdapter: <
      TEntity extends BaseEntity<TMetadata>,
      TMetadata = Record<string, unknown>,
    >(
      type: string,
    ): EntityAdapter<TEntity, TMetadata> => {
      const adapter = entityAdapters.get(type);
      if (!adapter) {
        throw new Error(`No adapter registered for entity type: ${type}`);
      }
      // A heterogeneous registry cannot prove the stored adapter matches the
      // caller-chosen T; the real EntityRegistry asserts at exactly this point
      // for the same reason.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the comment above
      return adapter as EntityAdapter<TEntity, TMetadata>;
    },
    hasEntityType: (type: string) => entityTypes.has(type),
    validateEntity: (type: string, entity: unknown): BaseEntity => {
      const adapter = entityAdapters.get(type);
      if (adapter) return adapter.schema.parse(entity);
      throw new Error(`No schema registered for entity type: ${type}`);
    },
    getAllEntityTypes: () => Array.from(entityTypes),
    getEntityTypeConfig,
    getWeightMap: () => ({}),
    registerCreateInterceptor: (type, interceptor) => {
      createInterceptors.set(type, interceptor);
    },
    getCreateInterceptor: (type) => createInterceptors.get(type),
    registerUploadSaveHandler: (registration): void => {
      uploadSaveHandlers.push(registration);
    },
    getUploadSaveHandler: (mediaType) =>
      uploadSaveHandlers.find((registration) =>
        registration.mediaTypes.some((pattern) =>
          pattern.endsWith("/*")
            ? mediaType.startsWith(pattern.slice(0, -1))
            : mediaType === pattern,
        ),
      ),
    registerPersistValidator: (): void => {},
    getPersistValidator: () => undefined,
    extendFrontmatterSchema: (): void => {},
    getEffectiveFrontmatterSchema: () => undefined,
  };

  // --- In-memory job queue state ---
  // Enqueued jobs are remembered so status reads see what writes created; a
  // fake queue that forgets its own enqueues makes reconciliation code treat
  // every fresh job as pruned.
  const enqueuedJobs = new Map<string, JobInfo>();
  let enqueuedJobCount = 0;

  function recordEnqueuedJob(request: JobQueueEnqueueRequest): string {
    const id = `job-${++enqueuedJobCount}`;
    const now = Date.now();
    enqueuedJobs.set(id, {
      id,
      type: request.type,
      data:
        typeof request.data === "string"
          ? request.data
          : JSON.stringify(request.data ?? {}),
      status: "pending",
      source: request.options?.source ?? null,
      priority: 0,
      retryCount: 0,
      maxRetries: request.options?.maxRetries ?? 3,
      lastError: null,
      createdAt: now,
      scheduledFor: now,
      startedAt: null,
      completedAt: null,
      attemptId: null,
      workerSlotId: null,
      workerSessionId: null,
      leaseExpiresAt: null,
      attemptHeartbeatAt: null,
      runtimeUpdatedAt: now,
      metadata: {
        operationType: "data_processing",
        ...request.options?.metadata,
        rootJobId: request.options?.rootJobId ?? id,
      },
      progress: null,
      result: null,
    });
    return id;
  }

  function listQueuedJobs(types?: string[]): JobInfo[] {
    return [...enqueuedJobs.values()].filter(
      (job) => !types || types.length === 0 || types.includes(job.type),
    );
  }

  // --- Jobs namespace ---
  const jobs: IJobsNamespace = {
    enqueueBatch: async (operations, options, batchId) => {
      for (const operation of operations) {
        recordEnqueuedJob({
          type: operation.type,
          data: operation.data,
          options: { ...options, rootJobId: batchId },
        });
      }
      return batchId;
    },
    getActiveBatches: async () => [],
    getBatchStatus: async (batchId: string) => ({
      batchId,
      totalOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
      errors: [],
      status: "completed" as const,
    }),
    getActiveJobs: async (types) =>
      listQueuedJobs(types).filter(
        (job) => job.status === "pending" || job.status === "processing",
      ),
    getRecentJobs: async (types, limit = 20) =>
      listQueuedJobs(types)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit),
    getStatus: async (jobId) => enqueuedJobs.get(jobId) ?? null,
  };

  // --- Content Service ---
  // The real service narrows registered templates before handing them out, so
  // the fake does the same. Returning the raw Template would give tests fields
  // (layout, and anything else Template carries) that production never exposes.
  const toContentTemplate = (template: Template): ContentTemplate<unknown> => {
    const contentTemplate: ContentTemplate<unknown> = {
      name: template.name,
      description: template.description,
      schema: template.schema,
      requiredPermission: template.requiredPermission,
    };
    if (template.basePrompt) contentTemplate.basePrompt = template.basePrompt;
    if (template.formatter) contentTemplate.formatter = template.formatter;
    if (template.dataSourceId) {
      contentTemplate.dataSourceId = template.dataSourceId;
    }
    return contentTemplate;
  };

  const generationAuthorizer = (): GenerationAuthorizer =>
    new GenerationAuthorizer(shell.getPermissionService(), async () => null);
  const contentService: IContentService = {
    submitGeneration: (request, binding, signal) =>
      submitContentGeneration(contentService, request, binding, signal),
    // Delegate to the runtime routine so the fake enforces production policy.
    authorizeGenerationWrite: (data, persisted) =>
      authorizeGenerationWrite(
        {
          authorizer: generationAuthorizer(),
          templateRegistry: { get: (name) => templates.get(name) },
          entityService,
        },
        data,
        persisted,
      ),
    planGeneration: (request, signal) =>
      planContentGeneration(
        {
          entityService,
          authorizer: generationAuthorizer(),
          templateRegistry: { get: (name) => templates.get(name) },
        },
        request,
        signal,
      ),
    generateContent: async (
      templateName: string,
      context?: Record<string, unknown>,
    ) => ({
      message: `Generated content for ${templateName}`,
      summary: "Test summary",
      description: "Mock generated description for testing",
      topics: [],
      sources: [],
      ...context,
    }),
    formatContent: <T = unknown>(_templateName: string, data: T) =>
      `Formatted: ${JSON.stringify(data)}`,
    parseContent: (_templateName: string, content: string): unknown => ({
      parsed: content,
    }),
    getTemplate: (name: string): ContentTemplate<unknown> | null => {
      const template = templates.get(name);
      return template ? toContentTemplate(template) : null;
    },
    listTemplates: (): ContentTemplate<unknown>[] =>
      Array.from(templates.values()).map(toContentTemplate),
    // No data sources are wired into the fake, so nothing resolves.
    resolveContent: async <T = unknown>(): Promise<T | null> => null,
  } satisfies IContentService;

  // --- DataSource Registry ---
  const dataSourceRegistry: DataSourceRegistry = {
    register: (dataSource: DataSource): void => {
      if ("id" in dataSource && typeof dataSource.id === "string") {
        dataSources.set(dataSource.id, dataSource);
      }
    },
    get: (id: string): DataSource | undefined => dataSources.get(id),
    has: (id: string): boolean => dataSources.has(id),
    list: (): DataSource[] => Array.from(dataSources.values()),
    getIds: (): string[] => Array.from(dataSources.keys()),
    getByCapability: (capability: keyof DataSourceCapabilities): DataSource[] =>
      Array.from(dataSources.values()).filter((dataSource) => {
        switch (capability) {
          case "canFetch":
            return Boolean(dataSource.fetch);
          case "canGenerate":
            return Boolean(dataSource.generate);
          case "canTransform":
            return Boolean(dataSource.transform);
        }
      }),
    find: (predicate: (dataSource: DataSource) => boolean): DataSource[] =>
      Array.from(dataSources.values()).filter(predicate),
    clear: (): void => {
      dataSources.clear();
    },
    unregister: (id: string): void => {
      dataSources.delete(id);
    },
  };

  // Only the nominal private-field gap remains; the shape is checked above.

  // --- Daemon Registry ---
  // --- Insights Registry ---
  const insightHandlers = new Map<string, InsightHandler>();
  const insightsRegistry: IInsightsRegistry = {
    register: (type: string, handler: InsightHandler) => {
      insightHandlers.set(type, handler);
    },
    unregister: (type: string) => {
      insightHandlers.delete(type);
    },
    getTypes: () => Array.from(insightHandlers.keys()),
    get: async (type: string, es, visibilityScope) => {
      const handler = insightHandlers.get(type);
      if (!handler)
        throw new Error(
          `Unknown insight type: ${type}. Available: ${Array.from(insightHandlers.keys()).join(", ")}`,
        );
      return handler(es, visibilityScope);
    },
  };

  const daemons = new Map<
    string,
    {
      name: string;
      daemon: Daemon;
      pluginId: string;
      status: "stopped" | "starting" | "running" | "stopping" | "error";
    }
  >();

  const endpoints: EndpointInfo[] = [];
  const interactions: InteractionInfo[] = [];

  const daemonRegistry: IDaemonRegistry = {
    register: (name, daemon, pluginId) => {
      daemons.set(name, { name, daemon, pluginId, status: "stopped" });
    },
    has: (name) => daemons.has(name),
    get: (name) => daemons.get(name),
    start: async (name) => {
      const info = daemons.get(name);
      if (!info) return;
      info.status = "starting";
      await info.daemon.start();
      info.status = "running";
    },
    stop: async (name) => {
      const info = daemons.get(name);
      if (!info) return;
      info.status = "stopping";
      await info.daemon.stop();
      info.status = "stopped";
    },
    checkHealth: async (name) => {
      const info = daemons.get(name);
      if (!info?.daemon.healthCheck) return undefined;
      return info.daemon.healthCheck();
    },
    getByPlugin: (pluginId) =>
      Array.from(daemons.values()).filter((info) => info.pluginId === pluginId),
    getAll: () => Array.from(daemons.keys()),
    getAllInfo: () => Array.from(daemons.values()),
    getStatuses: async () =>
      Array.from(daemons.values()).map((info) => ({
        name: info.name,
        pluginId: info.pluginId,
        status: info.status,
      })),
    unregister: async (name) => {
      daemons.delete(name);
    },
    startPlugin: async (pluginId) => {
      for (const info of daemons.values()) {
        if (info.pluginId === pluginId) {
          info.status = "starting";
          await info.daemon.start();
          info.status = "running";
        }
      }
    },
    stopPlugin: async (pluginId) => {
      for (const info of daemons.values()) {
        if (info.pluginId === pluginId) {
          info.status = "stopping";
          await info.daemon.stop();
          info.status = "stopped";
        }
      }
    },
    clear: async () => {
      daemons.clear();
    },
  };

  // --- The MockShell object ---
  const getPluginHttpRoutes = (): readonly RegisteredHttpRoute[] => {
    const routes: RegisteredHttpRoute[] = [];
    for (const [pluginId, plugin] of plugins) {
      for (const definition of plugin.getWebRoutes?.() ?? []) {
        routes.push({
          kind: "handler",
          ownerPluginId: pluginId,
          fullPath: definition.path,
          method: definition.method ?? "GET",
          match: definition.match ?? "exact",
          sharedHostAdmission: definition.public ? "admit" : "deny",
          ...(definition.preview === true ? { preview: true } : {}),
          handler: definition.handler,
        });
      }
      for (const definition of plugin.getApiRoutes?.() ?? []) {
        routes.push({
          kind: "tool",
          ownerPluginId: pluginId,
          fullPath: `/api/${pluginId}${definition.path}`,
          method: definition.method,
          match: "exact",
          sharedHostAdmission: definition.public ? "admit" : "deny",
          definition,
        });
      }
    }
    return routes;
  };

  const jobQueueService: IJobQueueService = {
    enqueue: async (request) => recordEnqueuedJob(request),
    // The real service reports whether the job was still claimable; the fake
    // has no attempt bookkeeping, so it reports success.
    complete: async () => true,
    fail: async () => true,
    update: async () => true,
    getStatus: async (jobId) => enqueuedJobs.get(jobId) ?? null,
    getJobsByRootJobId: async (rootJobId) =>
      listQueuedJobs().filter((job) => job.metadata.rootJobId === rootJobId),
    getStats: async () => ({
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
      total: 0,
    }),
    cleanup: async () => 0,
    getRuntimeUpdates: async () => [],
    registerHandler: () => {},
    unregisterHandler: () => {},
    unregisterPluginHandlers: () => {},
    getRegisteredTypes: () => [],
    getHandler: () => undefined,
    getValidator: () => undefined,
    finalizeHandlerRegistrations: () => [],
    getExecutionRegistrations: () => [],
    getActiveJobs: async (types) =>
      listQueuedJobs(types).filter(
        (job) => job.status === "pending" || job.status === "processing",
      ),
    getRecentJobs: async (types, limit = 20) =>
      listQueuedJobs(types)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit),
    getFailedJobs: async () => [],
    getStatusByEntityId: async () => null,
    getDiagnostics: async () => ({
      totals: { pending: 0, processing: 0, failed: 0, completed: 0 },
      byType: [],
      oldestPendingAgeMs: null,
      duePending: 0,
      oldestDuePendingAgeMs: null,
      latestClaimAgeMs: null,
      oldestProcessingAgeMs: null,
      staleLeaseCount: 0,
      workerSessions: {
        total: 0,
        active: 0,
        stale: 0,
        latestHeartbeatAgeMs: null,
      },
    }),
    // No worker loop is modelled: nothing is ever dequeued, so lease and
    // session calls are inert rather than pretending to hold a claim.
    dequeue: async () => null,
    startWorkerSession: async () => {},
    heartbeatWorkerSession: async () => true,
    endWorkerSession: async () => true,
    renewAttemptLease: async () => true,
    recordAttemptProgress: async () => true,
    // Idle by construction, for the same reason: nothing is ever dequeued.
    waitForIdle: async () => {},
    close: () => {},
  };

  const renderService: ViewTemplateRegistry = {
    get: () => undefined,
    list: () => [],
    validate: () => true,
    findViewTemplate: () => undefined,
    getRenderer: () => undefined,
    hasRenderer: () => false,
    listFormats: () => [],
  };

  const mcpTransport: IMCPTransport = {
    getMcpServer: (): never => {
      throw new Error("Mock MCP server not implemented");
    },
    createMcpServer: (): never => {
      throw new Error("Mock MCP server not implemented");
    },
    setPermissionLevel: () => {},
    setProtocolMode: () => {},
  };

  const shell: MockShell = {
    // Core services
    getMessageBus: () => messageBus,
    getContentService: () => contentService,
    getLogger: () => logger,
    getEntityService: () => entityService,
    getEntityRegistry: () => entityRegistry,
    getJobQueueService: () => jobQueueService,
    getRenderService: () => renderService,
    getAttachmentRegistry: () => createAttachmentsNamespace(attachmentRegistry),
    getRuntimeUploadRegistry: () =>
      createRuntimeUploadsNamespace(runtimeUploadRegistry),
    getRuntimeState: () => runtimeState,
    getRecurringChecks: () => ({ register: () => () => {} }),
    getConversationService: () => conversationService,
    getMCPService: () => mcpTransport,
    listToolsForPermissionLevel: (_level: unknown): ToolInfo[] => [],
    getPermissionService: () => new PermissionService({}),
    getDataSourceRegistry: () => dataSourceRegistry,
    getAgentService: () => agentService,

    // Identity and Profile
    getIdentity: (): BrainCharacter => ({
      name: "Test Brain",
      role: "Test Assistant",
      purpose: "Testing purposes",
      values: ["reliability", "accuracy"],
    }),
    getProfile: (): AnchorProfile => ({
      name: "Test Owner",
      description: "Test profile for unit tests",
    }),
    getProfileKindRegistry: () => profileKindRegistry,
    getChannelRegistry: () => channelRegistry,
    getInboxRegistry: () => inboxRegistry,
    getInboxFollowUpRegistry: () => inboxFollowUpRegistry,
    getOperationalHealthRegistry: () => operationalHealthRegistry,
    getAccountSettingsRegistry: () => accountSettingsRegistry,
    getDomain: (): string | undefined => options.domain,
    getLocalSiteUrl: (): string | undefined => options.localSiteUrl,
    shouldPreferLocalUrls: (): boolean => options.preferLocalUrls ?? false,
    getThemeCSS: (): string => options.themeCSS ?? "",
    getSpaces: (): string[] => options.spaces ?? [],

    // Data directory
    getDataDir: () => options.dataDir ?? "/tmp/mock-shell-test-data",
    getGitBrokerSocket: () => options.gitBrokerSocket,
    getGitBrokerCheckout: () => options.gitBrokerCheckout,

    // App metadata
    getAppInfo: async (): Promise<RuntimeAppInfo> => ({
      model: "test-brain",
      version: "1.0.0",
      uptime: 0,
      entities: 0,
      entityCounts: [],
      embeddings: 0,
      backgroundWork: {
        status: "operational",
        reasons: [],
        worker: {
          state: "active",
          activeSessions: 1,
          staleSessions: 0,
          latestHeartbeatAgeMs: 0,
        },
        queue: {
          duePending: 0,
          processing: 0,
          oldestDuePendingAgeMs: null,
          latestClaimAgeMs: null,
          stalled: false,
        },
      },
      ai: {
        model: "gpt-4.1",
        embeddingModel: "text-embedding-3-small",
      },
      daemons: [],
      endpoints: [...endpoints].sort(
        (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
      ),
      interactions: [...interactions].sort(
        (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
      ),
    }),
    getRuntimeReadiness: async (): Promise<RuntimeReadiness> => ({
      status: "ready",
      operationalStatus: "operational",
      checkedAt: new Date().toISOString(),
      checks: [],
      resources: {
        memory: { rssBytes: 0, heapUsedBytes: 0, heapTotalBytes: 0 },
        fileDescriptors: null,
        processes: { total: null, zombies: null },
        queue: {
          totals: { pending: 0, processing: 0, completed: 0, failed: 0 },
          byType: [],
          oldestPendingAgeMs: null,
          duePending: 0,
          oldestDuePendingAgeMs: null,
          latestClaimAgeMs: null,
          oldestProcessingAgeMs: null,
          staleLeaseCount: 0,
          workerSessions: {
            total: 1,
            active: 1,
            stale: 0,
            latestHeartbeatAgeMs: 0,
          },
        },
        projection: {
          initialized: true,
          trackedRoots: 0,
          openCircuits: [],
        },
        worker: {
          total: 1,
          active: 1,
          stale: 0,
          latestHeartbeatAgeMs: 0,
        },
      },
    }),

    // High-level operations
    generateContent: async (
      config: ContentGenerationConfig,
    ): Promise<unknown> => {
      return contentService.generateContent(config.templateName, {
        prompt: config.prompt,
        ...(config.conversationHistory && {
          conversationHistory: config.conversationHistory,
        }),
        ...(config.data && { data: config.data }),
      });
    },
    // Parsed through the caller's own schema: an empty object asserted into
    // T would satisfy any caller while proving nothing.
    generateObject: async <T>(
      _prompt: string,
      schema: AIGenerationSchema<T>,
    ): Promise<{ object: T }> => ({ object: schema.parse({}) }),
    judge: async <T>(
      input: JudgeInput<T>,
    ): Promise<{
      verdict: T;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }> => {
      const { object } = await shell.generateObject<T>(
        [input.instruction, input.material].join("\n\n"),
        input.schema,
      );
      return {
        verdict: object,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    },
    query: async (
      prompt: string,
      context?: QueryContext,
    ): Promise<DefaultQueryResponse> => {
      const { conversationHistory, ...contextData } = context ?? {};
      return defaultQueryResponseSchema.parse(
        await shell.generateContent({
          prompt,
          templateName: "shell:knowledge-query",
          ...(conversationHistory && { conversationHistory }),
          ...(context && { data: contextData }),
          interfacePermissionGrant: "public",
        }),
      );
    },

    // Image generation
    generateImage: async (
      _prompt: string,
      _options?: ImageGenerationOptions,
    ): Promise<ImageGenerationResult> => {
      const placeholderBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      return {
        base64: placeholderBase64,
        dataUrl: `data:image/png;base64,${placeholderBase64}`,
      };
    },
    canGenerateImages: () => false,

    // Templates
    registerTemplates: (tmpls: Record<string, Template>, pluginId?: string) => {
      for (const [name, template] of Object.entries(tmpls)) {
        const scopedName = pluginId ? `${pluginId}:${name}` : `shell:${name}`;
        templates.set(scopedName, template);
      }
    },
    getTemplate: (name: string) => templates.get(name),

    // Plugin capability registration
    registerTools: (_pluginId: string, _tools: Tool[]) => {},
    registerResources: (_pluginId: string, _resources: Resource[]) => {},
    registerResourceTemplate: (
      _pluginId: string,
      _template: ResourceTemplate,
    ) => {},
    registerPrompt: (_pluginId: string, _prompt: Prompt) => {},
    registerInstructions: (_pluginId: string, _instructions: string) => {},

    // Plugin info
    getPluginPackageName: (pluginId: string) =>
      plugins.get(pluginId)?.packageName,
    hasPlugin: (pluginId: string) => plugins.has(pluginId),

    // Jobs namespace
    jobs,

    // Daemon registration
    registerDaemon: (name: string, daemon: Daemon, pluginId: string) => {
      daemonRegistry.register(name, daemon, pluginId);
    },

    // Endpoint advertisement
    registerEndpoint: (endpoint: EndpointInfoInput) => {
      endpoints.push({
        ...endpoint,
        priority: endpoint.priority ?? 100,
        visibility: endpoint.visibility ?? "public",
      });
    },
    listEndpoints: (): EndpointInfo[] =>
      [...endpoints].sort(
        (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
      ),
    registerInteraction: (interaction: InteractionInfoInput) => {
      interactions.push({
        ...interaction,
        priority: interaction.priority ?? 100,
        visibility: interaction.visibility ?? "public",
        status: interaction.status ?? "available",
      });
    },
    listInteractions: (): InteractionInfo[] =>
      [...interactions].sort(
        (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
      ),

    // Eval handler registration
    registerEvalHandler: (
      _pluginId: string,
      _handlerId: string,
      _handler: EvalHandler,
    ) => {},

    // Insights registry
    getInsightsRegistry: () => insightsRegistry,

    // API routes
    getPluginApiRoutes: (): RegisteredApiRoute[] => {
      const routes: RegisteredApiRoute[] = [];
      for (const [pluginId, plugin] of plugins) {
        if (
          "getApiRoutes" in plugin &&
          typeof plugin.getApiRoutes === "function"
        ) {
          const pluginRoutes = plugin.getApiRoutes();
          for (const definition of pluginRoutes) {
            routes.push({
              pluginId,
              fullPath: `/api/${pluginId}${definition.path}`,
              definition,
            });
          }
        }
      }
      return routes;
    },
    getPluginWebRoutes: (): RegisteredWebRoute[] => {
      const routes: RegisteredWebRoute[] = [];
      for (const [pluginId, plugin] of plugins) {
        if (
          "getWebRoutes" in plugin &&
          typeof plugin.getWebRoutes === "function"
        ) {
          const pluginRoutes = plugin.getWebRoutes();
          for (const definition of pluginRoutes) {
            routes.push({
              pluginId,
              fullPath: definition.path,
              definition,
            });
          }
        }
      }
      return routes;
    },
    // --- Test helpers ---
    addEntities: (ents: BaseEntity[]) => {
      for (const entity of ents) {
        entities.set(entity.id, entity);
        entityTypes.add(entity.entityType);
      }
    },
    clearEntities: () => {
      entities.clear();
    },
    registerPlugin: (plugin: Plugin) => {
      plugins.set(plugin.id, plugin);
    },
    addPlugin: (plugin: Plugin) => {
      plugins.set(plugin.id, plugin);
    },
    getPlugin: (pluginId: string) => plugins.get(pluginId),
    getTemplates: () => new Map(templates),
    setAgentService: (svc: IAgentService) => {
      agentService = svc;
    },
    setConversationService: (svc: IConversationService) => {
      conversationService = svc;
    },
    getDaemonRegistry: () => daemonRegistry,
  };

  bindHttpRouteSnapshot(shell, getPluginHttpRoutes);
  return shell;
}
