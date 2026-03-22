import type {
  IShell,
  Plugin,
  PluginTool,
  PluginResource,
  ContentGenerationConfig,
  QueryContext,
  DefaultQueryResponse,
  EvalHandler,
  RegisteredApiRoute,
  ToolInfo,
  IMCPTransport,
  AppInfo,
  Daemon,
  IDaemonRegistry,
} from "@brains/plugins";
import type { Template } from "@brains/templates";
import { PermissionService } from "@brains/templates";
import type {
  MessageHandler,
  MessageBus,
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
} from "@brains/entity-service";
import type { IJobQueueService, IJobsNamespace } from "@brains/job-queue";
import type { RenderService } from "@brains/templates";
import type { IConversationService } from "@brains/conversation-service";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import type {
  IAgentService,
  AgentResponse,
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
  };
}

/**
 * Create a mock Shell for testing plugins.
 *
 * Returns a plain object satisfying IShell + test helpers.
 * Stateful backing stores for entities, templates, data sources, and message handlers.
 * Methods can be reassigned in tests: `mockShell.registerPluginTools = mock(...)`
 */
export function createMockShell(options: MockShellOptions = {}): MockShell {
  const logger = options.logger ?? createSilentLogger("MockShell");

  // Stateful backing stores
  const entities = new Map<string, BaseEntity>();
  const entityTypes = new Set<string>();
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
    send: async (
      type: string,
      payload: unknown,
      source: string,
      _target?: string,
      _metadata?: Record<string, unknown>,
      broadcast?: boolean,
    ) => {
      const handlers = messageHandlers.get(type) ?? new Set();
      let result: MessageResponse<unknown> = { success: true };
      for (const handler of handlers) {
        const response = await handler({
          type,
          payload,
          source,
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
    createEntity: async (entity: BaseEntity) => {
      entityTypes.add(entity.entityType);
      const id = entity.id || `entity-${Date.now()}`;
      entities.set(id, { ...entity, id });
      return { entityId: id, jobId: `job-${id}` };
    },
    updateEntity: async (entity: BaseEntity) => {
      if (!entity.id) throw new Error("Entity must have an id");
      entities.set(entity.id, entity);
      return { entityId: entity.id, jobId: `job-${entity.id}` };
    },
    deleteEntity: async (_type: string, id: string) => {
      entities.delete(id);
      return true;
    },
    getEntity: async (type: string, id: string) => {
      const entity = entities.get(id);
      return entity?.entityType === type ? entity : null;
    },
    listEntities: async (
      type: string,
      opts?: {
        filter?: { metadata?: Record<string, unknown> };
        publishedOnly?: boolean;
      },
    ) => {
      let results = Array.from(entities.values()).filter(
        (e) => e.entityType === type,
      );
      if (opts?.publishedOnly) {
        results = results.filter((e) => e.metadata["status"] === "published");
      }
      if (opts?.filter?.metadata) {
        const filterEntries = Object.entries(opts.filter.metadata);
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
    upsertEntity: async (entity: BaseEntity) => {
      entityTypes.add(entity.entityType);
      const exists = entity.id ? entities.has(entity.id) : false;
      if (exists) {
        entities.set(entity.id, entity);
        return {
          entityId: entity.id,
          jobId: `job-${entity.id}`,
          created: false,
        };
      }
      const id = entity.id || `entity-${Date.now()}`;
      entities.set(id, { ...entity, id });
      return { entityId: id, jobId: `job-${id}`, created: true };
    },
    getWeightMap: () => ({}),
    countEntities: async () => 0,
    getEntityCounts: async () => [],
  } as unknown as IEntityService;

  // --- Entity Registry ---
  const entityRegistry: IEntityRegistry = {
    registerEntityType: (type: string) => {
      entityTypes.add(type);
    },
    getSchema: (): never => {
      throw new Error("Not implemented");
    },
    getAdapter: (): never => {
      throw new Error("Not implemented");
    },
    hasEntityType: (type: string) => entityTypes.has(type),
    validateEntity: <TData>(_type: string, entity: unknown) => entity as TData,
    getAllEntityTypes: () => Array.from(entityTypes),
    getEntityTypeConfig: () => ({}),
    getWeightMap: () => ({}),
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
  const daemonRegistry: IDaemonRegistry = {
    register: () => {},
    has: () => false,
    get: () => undefined,
    start: async () => {},
    stop: async () => {},
    checkHealth: async () => undefined,
    getByPlugin: () => [],
    getAll: () => [],
    getAllInfo: () => [],
    getStatuses: async () => [],
    unregister: async () => {},
    startPlugin: async () => {},
    stopPlugin: async () => {},
    clear: async () => {},
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
        searchConversations: async () => [],
        getMessages: async () => [],
      }) as IConversationService,
    getMcpTransport: () =>
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
      description: "Test profile for unit tests",
    }),

    // Data directory
    getDataDir: () => options.dataDir ?? "/tmp/mock-shell-test-data",

    // App metadata
    getAppInfo: async (): Promise<AppInfo> => ({
      model: "test-brain",
      version: "1.0.0",
      plugins: [],
      interfaces: [],
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
    registerPluginTools: (_pluginId: string, _tools: PluginTool[]) => {},
    registerPluginResources: (
      _pluginId: string,
      _resources: PluginResource[],
    ) => {},
    registerPluginInstructions: (
      _pluginId: string,
      _instructions: string,
    ) => {},

    // Plugin info
    getPluginPackageName: (pluginId: string) =>
      plugins.get(pluginId)?.packageName,

    // Jobs namespace
    jobs,

    // Daemon registration
    registerDaemon: (_name: string, _daemon: Daemon, _pluginId: string) => {},

    // Eval handler registration
    registerEvalHandler: (
      _pluginId: string,
      _handlerId: string,
      _handler: EvalHandler,
    ) => {},

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
