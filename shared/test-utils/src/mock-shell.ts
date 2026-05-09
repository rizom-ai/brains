import type {
  IShell,
  Plugin,
  Tool,
  Resource,
  ResourceTemplate,
  Prompt,
  ContentGenerationConfig,
  QueryContext,
  DefaultQueryResponse,
  EvalHandler,
  RegisteredApiRoute,
  RegisteredWebRoute,
  ToolInfo,
  IMCPTransport,
  RuntimeAppInfo,
  Daemon,
  EndpointInfo,
  IDaemonRegistry,
  IInsightsRegistry,
  InsightHandler,
} from "@brains/plugins";
import type { Template } from "@brains/templates";
import { PermissionService } from "@brains/templates";
import type {
  MessageHandler,
  MessageBus,
  MessageBusSendRequest,
  MessageResponse,
} from "@brains/messaging-service";
import type { ContentService } from "@brains/content-service";
import type { Logger } from "@brains/utils";
import type {
  IEntityService,
  IEntityRegistry,
  BaseEntity,
  DataSourceRegistry,
  DataSource,
  EntityAdapter,
} from "@brains/entity-service";
import { computeContentHash } from "@brains/utils/hash";
import type { IJobQueueService, IJobsNamespace } from "@brains/job-queue";
import type { RenderService } from "@brains/templates";
import type { IConversationService } from "@brains/conversation-service";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import type {
  AgentResponse,
  IAgentService,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import { createSilentLogger } from "./mock-logger";

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
  getDaemonRegistry(): IDaemonRegistry;
}

export interface MockShellOptions {
  logger?: Logger;
  agentService?: IAgentService;
  dataDir?: string;
  /** Bare domain string (e.g. "yeehaa.io") for identity.getSiteUrl/getPreviewUrl */
  domain?: string;
  /** Shared conversation spaces */
  spaces?: string[];
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

/**
 * Create a mock Shell for testing plugins.
 *
 * Returns a plain object satisfying IShell + test helpers.
 * Stateful backing stores for entities, templates, data sources, and message handlers.
 * Methods can be reassigned in tests: `mockShell.registerTools = mock(...)`
 */
export function createMockShell(options: MockShellOptions = {}): MockShell {
  const logger = options.logger ?? createSilentLogger("MockShell");

  // Stateful backing stores
  const entities = new Map<string, BaseEntity>();
  const entityTypes = new Set<string>();
  const entityAdapters = new Map<string, EntityAdapter<BaseEntity>>();

  // Serialize an entity the way the real EntityService would: adapter
  // rebuilds markdown from entity fields, adapter extracts canonical
  // metadata. Falls back to verbatim content when no adapter is registered
  // (tests that register entity types by name only).
  const serializeViaAdapter = (
    entity: BaseEntity,
  ): { content: string; metadata: Record<string, unknown> } => {
    const adapter = entityAdapters.get(entity.entityType);
    // Fall back to verbatim when no real adapter is registered.
    // Some tests register entity types with a stub (`{} as never`) to
    // satisfy the registry signature without caring about serialization.
    if (typeof adapter?.toMarkdown !== "function") {
      return {
        content: entity.content,
        metadata: entity.metadata,
      };
    }
    return {
      content: adapter.toMarkdown(entity),
      metadata: adapter.extractMetadata(entity),
    };
  };
  const templates = new Map<string, Template>();
  const dataSources = new Map<string, DataSource>();
  const plugins = new Map<string, Plugin>();
  const messageHandlers = new Map<
    string,
    Set<MessageHandler<unknown, unknown>>
  >();

  let agentService: IAgentService =
    options.agentService ?? createDefaultMockAgentService();

  // --- Message Bus (stateful — plugins subscribe during register, tests send) ---
  const messageBus: MessageBus = {
    send: async (request: MessageBusSendRequest) => {
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
      return result;
    },
    subscribe: (type: string, handler: MessageHandler<unknown, unknown>) => {
      if (!messageHandlers.has(type)) {
        messageHandlers.set(type, new Set());
      }
      const handlers = messageHandlers.get(type);
      if (handlers) handlers.add(handler);
      return () => {
        messageHandlers.get(type)?.delete(handler);
      };
    },
    unsubscribe: () => {},
    getSubscriptions: () => Array.from(messageHandlers.keys()),
  } as unknown as MessageBus;

  // --- Entity Service (stateful) ---
  const entityService: IEntityService = {
    createEntity: async (request: { entity: BaseEntity }) => {
      const entity = request.entity;
      entityTypes.add(entity.entityType);
      const id = entity.id || `entity-${Date.now()}`;
      const { content, metadata } = serializeViaAdapter({ ...entity, id });
      entities.set(id, {
        ...entity,
        id,
        content,
        metadata,
        contentHash: computeContentHash(content),
      });
      return { entityId: id, jobId: `job-${id}`, skipped: false };
    },
    updateEntity: async (request: { entity: BaseEntity }) => {
      const entity = request.entity;
      if (!entity.id) throw new Error("Entity must have an id");
      const { content, metadata } = serializeViaAdapter(entity);
      entities.set(entity.id, {
        ...entity,
        content,
        metadata,
        contentHash: computeContentHash(content),
      });
      return { entityId: entity.id, jobId: `job-${entity.id}`, skipped: false };
    },
    deleteEntity: async (request: { entityType: string; id: string }) => {
      entities.delete(request.id);
      return true;
    },
    getEntity: async (request: { entityType: string; id: string }) => {
      const entity = entities.get(request.id);
      return entity?.entityType === request.entityType ? entity : null;
    },
    listEntities: async (request: {
      entityType: string;
      options?: {
        filter?: { metadata?: Record<string, unknown> };
        publishedOnly?: boolean;
      };
    }) => {
      let results = Array.from(entities.values()).filter(
        (e) => e.entityType === request.entityType,
      );
      if (request.options?.publishedOnly) {
        results = results.filter((e) => e.metadata["status"] === "published");
      }
      if (request.options?.filter?.metadata) {
        const filterEntries = Object.entries(request.options.filter.metadata);
        results = results.filter((e) =>
          filterEntries.every(([key, value]) => e.metadata[key] === value),
        );
      }
      return results;
    },
    search: async () => [],
    getEntityTypes: () => Array.from(entityTypes),
    hasEntityType: (type: string) => entityTypes.has(type),
    serializeEntity: (entity: BaseEntity) => JSON.stringify(entity),
    deserializeEntity: (markdown: string) =>
      ({ content: markdown }) as BaseEntity,
    getAsyncJobStatus: async () => ({ status: "completed" as const }),
    upsertEntity: async (request: { entity: BaseEntity }) => {
      const entity = request.entity;
      entityTypes.add(entity.entityType);
      const id = entity.id || `entity-${Date.now()}`;
      const exists = entities.has(id);
      const { content, metadata } = serializeViaAdapter({ ...entity, id });
      entities.set(id, {
        ...entity,
        id,
        content,
        metadata,
        contentHash: computeContentHash(content),
      });
      return {
        entityId: id,
        jobId: `job-${id}`,
        created: !exists,
        skipped: false,
      };
    },
    getWeightMap: () => ({}),
    countEntities: async () => 0,
    getEntityCounts: async () => [],
  } as unknown as IEntityService;

  // --- Entity Registry ---
  const createInterceptors = new Map<
    string,
    (input: unknown, executionContext: unknown) => Promise<unknown>
  >();

  const entityRegistry: IEntityRegistry = {
    registerEntityType: (type, _schema, adapter) => {
      entityTypes.add(type);
      entityAdapters.set(type, adapter as unknown as EntityAdapter<BaseEntity>);
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
      return adapter as unknown as EntityAdapter<TEntity, TMetadata>;
    },
    hasEntityType: (type: string) => entityTypes.has(type),
    validateEntity: <TData>(_type: string, entity: unknown) => entity as TData,
    getAllEntityTypes: () => Array.from(entityTypes),
    getEntityTypeConfig: () => ({}),
    getWeightMap: () => ({}),
    registerCreateInterceptor: (type, interceptor) => {
      createInterceptors.set(
        type,
        interceptor as (
          input: unknown,
          executionContext: unknown,
        ) => Promise<unknown>,
      );
    },
    getCreateInterceptor: (type) =>
      createInterceptors.get(type) as ReturnType<
        IEntityRegistry["getCreateInterceptor"]
      >,
    extendFrontmatterSchema: (): void => {},
    getEffectiveFrontmatterSchema: () => undefined,
  };

  // --- Jobs namespace ---
  const jobs: IJobsNamespace = {
    enqueueBatch: async () => `batch-${Date.now()}`,
    getActiveBatches: async () => [],
    getBatchStatus: async (batchId: string) => ({
      batchId,
      totalOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
      errors: [],
      status: "completed" as const,
    }),
    getActiveJobs: async () => [],
    getStatus: async () => null,
  };

  // --- Content Service ---
  const contentService: ContentService = {
    generateContent: async <T = unknown>(
      templateName: string,
      context?: Record<string, unknown>,
    ) =>
      ({
        message: `Generated content for ${templateName}`,
        summary: "Test summary",
        description: "Mock generated description for testing",
        topics: [],
        sources: [],
        ...context,
      }) as T,
    formatContent: <T = unknown>(_templateName: string, data: T) =>
      `Formatted: ${JSON.stringify(data)}`,
    parseContent: <T = unknown>(_templateName: string, content: string): T =>
      ({ parsed: content }) as T,
    hasTemplate: (name: string) => templates.has(name),
    getTemplate: (name: string) => templates.get(name) ?? null,
    listTemplates: () => Array.from(templates.values()),
    unregisterTemplate: (name: string) => {
      templates.delete(name);
    },
  } as unknown as ContentService;

  // --- DataSource Registry ---
  const dataSourceRegistry: DataSourceRegistry = {
    register: (dataSource: DataSource) => {
      if ("id" in dataSource && typeof dataSource.id === "string") {
        dataSources.set(dataSource.id, dataSource);
      }
    },
    registerWithId: (id: string, dataSource: DataSource) => {
      dataSources.set(id, dataSource);
    },
    get: (id: string) => dataSources.get(id),
    has: (id: string) => dataSources.has(id),
    list: () => Array.from(dataSources.values()),
    getIds: () => Array.from(dataSources.keys()),
    unregister: (id: string) => {
      dataSources.delete(id);
    },
  } as unknown as DataSourceRegistry;

  // --- Daemon Registry ---
  // --- Insights Registry ---
  const insightHandlers = new Map<string, InsightHandler>();
  const insightsRegistry: IInsightsRegistry = {
    register: (type: string, handler: InsightHandler) => {
      insightHandlers.set(type, handler);
    },
    getTypes: () => Array.from(insightHandlers.keys()),
    get: async (type: string, es) => {
      const handler = insightHandlers.get(type);
      if (!handler)
        throw new Error(
          `Unknown insight type: ${type}. Available: ${Array.from(insightHandlers.keys()).join(", ")}`,
        );
      return handler(es);
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
  const shell: MockShell = {
    // Core services
    getMessageBus: () => messageBus,
    getContentService: () => contentService,
    getLogger: () => logger,
    getEntityService: () => entityService,
    getEntityRegistry: () => entityRegistry,
    getJobQueueService: () =>
      ({
        enqueue: async () => `job-${Date.now()}`,
        complete: async () => {},
        fail: async () => {},
        getStatus: async () => null,
        getStats: async () => ({
          pending: 0,
          processing: 0,
          failed: 0,
          completed: 0,
          total: 0,
        }),
        cleanup: async () => 0,
        registerHandler: () => {},
        unregisterHandler: () => {},
        unregisterPluginHandlers: () => {},
        getRegisteredTypes: () => [],
        getHandler: () => undefined,
        update: async () => {},
        getActiveJobs: async () => [],
        getStatusByEntityId: async () => null,
      }) as unknown as IJobQueueService,
    getRenderService: () =>
      ({
        get: () => undefined,
        list: () => [],
        validate: () => true,
        findViewTemplate: () => undefined,
        getRenderer: () => undefined,
        hasRenderer: () => false,
        listFormats: () => [],
      }) as unknown as RenderService,
    getConversationService: () =>
      ({
        startConversation: async () => `conv-${Date.now()}`,
        addMessage: async (): Promise<void> => {},
        getConversation: async () => null,
        listConversations: async () => [],
        searchConversations: async () => [],
        getMessages: async () => [],
        countMessages: async () => 0,
        close: () => {},
      }) as IConversationService,
    getMCPService: () =>
      ({
        getMcpServer: () => {
          throw new Error("Mock MCP server not implemented");
        },
        createMcpServer: () => {
          throw new Error("Mock MCP server not implemented");
        },
        setPermissionLevel: () => {},
      }) as unknown as IMCPTransport,
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
      kind: "professional",
      description: "Test profile for unit tests",
    }),
    getDomain: (): string | undefined => options.domain,
    getSpaces: (): string[] => options.spaces ?? [],

    // Data directory
    getDataDir: () => options.dataDir ?? "/tmp/mock-shell-test-data",

    // App metadata
    getAppInfo: async (): Promise<RuntimeAppInfo> => ({
      model: "test-brain",
      version: "1.0.0",
      uptime: 0,
      entities: 0,
      embeddings: 0,
      ai: {
        model: "gpt-4.1",
        embeddingModel: "text-embedding-3-small",
      },
      daemons: [],
      endpoints: [...endpoints].sort(
        (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
      ),
    }),

    // High-level operations
    generateContent: async <T = unknown>(
      config: ContentGenerationConfig,
    ): Promise<T> => {
      return contentService.generateContent<T>(config.templateName, {
        prompt: config.prompt,
        ...(config.conversationHistory && {
          conversationHistory: config.conversationHistory,
        }),
        ...(config.data && { data: config.data }),
      });
    },
    generateObject: async <T>(): Promise<{ object: T }> => ({
      object: {} as T,
    }),
    query: async (
      prompt: string,
      context?: QueryContext,
    ): Promise<DefaultQueryResponse> => {
      const { conversationHistory, ...contextData } = context ?? {};
      return shell.generateContent<DefaultQueryResponse>({
        prompt,
        templateName: "shell:knowledge-query",
        ...(conversationHistory && { conversationHistory }),
        ...(context && { data: contextData }),
        interfacePermissionGrant: "public",
      });
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
    registerEndpoint: (endpoint: EndpointInfo) => {
      endpoints.push(endpoint);
    },
    listEndpoints: (): EndpointInfo[] =>
      [...endpoints].sort(
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
    getDaemonRegistry: () => daemonRegistry,
  };

  return shell;
}
