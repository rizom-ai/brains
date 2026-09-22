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
} from "../index";
import type { RegisteredHttpRoute } from "../types/http-routes";
import type { Template } from "@brains/templates";
import { PermissionService } from "@brains/templates";
import type { Logger } from "@brains/utils/logger";
import type { DefaultQueryResponse } from "@brains/contracts";
import { defaultQueryResponseSchema } from "@brains/contracts";
import { type IEntityService, type BaseEntity } from "@brains/entity-service";
import { createMockEntityStore } from "./mock-entity-store";
import { createMockMessageBus } from "./mock-message-bus";
import { createMockEntityRegistry } from "./mock-entity-registry";
import { createMockJobQueue } from "./mock-job-queue";
import { createMockContentServices } from "./mock-content";
import { createMockDaemonRegistry } from "./mock-daemon-registry";
import { createMockInsightsRegistry } from "./mock-insights-registry";
import { createMockEntityService } from "./mock-entity-service";
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
  const { entities, types: entityTypes } = entityStore;
  const templates = new Map<string, Template>();
  const plugins = new Map<string, Plugin>();

  let agentService: IAgentService =
    options.agentService ?? createDefaultMockAgentService();
  let conversationService: IConversationService =
    options.conversationService ?? createDefaultMockConversationService();

  // --- Message Bus (stateful — plugins subscribe during register, tests send) ---
  const messageBus = createMockMessageBus();

  // --- Entity Service (stateful) ---
  const defaultEntityService = createMockEntityService(entityStore);

  // Tests that want canned reads rather than the stateful fake can inject
  // their own; everything built from this shell then sees the same service.
  const entityService = options.entityService ?? defaultEntityService;

  // --- Entity Registry ---
  const entityRegistry = createMockEntityRegistry(entityStore);

  // --- In-memory job queue state, and the two views of it ---
  const { jobs, jobQueueService } = createMockJobQueue();

  // --- Content Service and DataSource Registry ---
  const { contentService, dataSourceRegistry } = createMockContentServices({
    templates,
    entityService,
    getPermissionService: () => shell.getPermissionService(),
  });

  // --- Daemon Registry ---
  // --- Insights Registry ---
  // --- Daemon and Insights registries ---
  const insightsRegistry = createMockInsightsRegistry();
  const daemonRegistry = createMockDaemonRegistry();

  // Advertised by the shell itself, not by either registry.
  const endpoints: EndpointInfo[] = [];
  const interactions: InteractionInfo[] = [];

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
