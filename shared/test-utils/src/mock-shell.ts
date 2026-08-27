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
} from "@brains/plugins";
import { bindHttpRouteSnapshot } from "@brains/plugins/internal/http-route-snapshot";
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
  ProjectionRule,
  ProjectionWriteIntent,
} from "@brains/plugins";
import type { AIGenerationSchema } from "@brains/ai-service";
import type { RegisteredHttpRoute } from "@brains/plugins/internal/http-routes";
import type { Template } from "@brains/templates";
import { PermissionService } from "@brains/templates";
import type {
  MessageHandler,
  MessageBus,
  MessageBusSendRequest,
  MessageResponse,
} from "@brains/messaging-service";
import type { IContentService, ContentTemplate } from "@brains/content-service";
import type { Logger } from "@brains/utils/logger";
import type { DefaultQueryResponse } from "@brains/contracts";
import {
  getVisibleContentVisibilities,
  normalizeContentVisibility,
  type IEntityService,
  type IEntityRegistry,
  type BaseEntity,
  type DataSourceRegistry,
  type DataSource,
  type EntityAdapter,
  type DataSourceCapabilities,
  type UploadSaveHandlerRegistration,
  type CreateEntityRequest,
  type UpdateEntityRequest,
  type UpsertEntityRequest,
  type GetEntityRequest,
  type ListEntitiesRequest,
  type EntityMutationResult,
  type EntityExportIntent,
} from "@brains/entity-service";
import { computeContentHash } from "@brains/utils/hash";
import type { IJobQueueService, IJobsNamespace } from "@brains/job-queue";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
import type { RenderService } from "@brains/templates";
import type { IConversationService } from "@brains/conversation-service";
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
} from "@brains/ai-service";
import { createSilentLogger } from "./mock-logger";
import type { PublicSurface } from "./public-surface";

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
        delete: async (key): Promise<boolean> => records.delete(key),
        list: async ({ keyPrefix } = {}): Promise<
          RuntimeStateRecordValue<T>[]
        > =>
          Array.from(records.entries())
            .filter(
              ([key]) => keyPrefix === undefined || key.startsWith(keyPrefix),
            )
            .map(([key, record]): RuntimeStateRecordValue<T> => ({
              key,
              value: options.schema.parse(record.value),
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
            })),
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
    listConversationsUpdatedSince: async () => [],
    searchConversations: async () => [],
    updateConversationMetadata: async () => false,
    deleteConversation: async () => false,
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

  // Stateful backing stores
  const entities = new Map<string, BaseEntity>();
  const entityExportIntents = new Map<string, EntityExportIntent>();
  let entityExportRevision = 0;
  const exportKey = (entityType: string, entityId: string): string =>
    `${entityType}\u0000${entityId}`;
  const updateEntityExportIntent = (
    entityType: string,
    entityId: string,
    operation: "upsert" | "delete",
    persistenceOrigin?: "ordinary" | "directory-sync",
  ): void => {
    const key = exportKey(entityType, entityId);
    if (persistenceOrigin === "directory-sync") {
      entityExportIntents.delete(key);
      return;
    }
    entityExportRevision += 1;
    entityExportIntents.set(key, {
      entityType,
      entityId,
      operation,
      revision: `mock-export-${entityExportRevision}`,
      markedAt: entityExportRevision,
    });
  };
  const entityTypes = new Set<string>();
  const entityAdapters = new Map<string, EntityAdapter<BaseEntity>>();
  const entityTypeConfigs = new Map<
    string,
    Parameters<IEntityRegistry["registerEntityType"]>[3]
  >();
  const getEntityTypeConfig = (
    type: string,
  ): NonNullable<Parameters<IEntityRegistry["registerEntityType"]>[3]> =>
    entityTypeConfigs.get(type) ?? {};

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
  let conversationService: IConversationService =
    options.conversationService ?? createDefaultMockConversationService();

  // --- Message Bus (stateful — plugins subscribe during register, tests send) ---
  const messageBusSurface: PublicSurface<MessageBus> = {
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
    // Validation belongs to the real bus's schema registry; the fake accepts
    // whatever a test sends rather than pretending to validate it.
    validateMessage: <T>(_messageType: string, payload: unknown): T =>
      payload as T,
  };

  // Only the nominal private-field gap remains; the shape is checked above.
  const messageBus = messageBusSurface as MessageBus;

  // --- Entity Service (stateful) ---
  const defaultEntityService: IEntityService = {
    createEntity: async <T extends BaseEntity>(
      request: CreateEntityRequest<T>,
    ): Promise<EntityMutationResult> => {
      // `EntityInput<T>` leaves id, timestamps and contentHash to the service,
      // so the fake fills them the way the real one does rather than assuming
      // the caller passed a complete entity.
      const input = request.entity;
      const now = new Date().toISOString();
      const id = input.id ?? `entity-${Date.now()}`;
      const entity: BaseEntity = {
        ...input,
        id,
        visibility: normalizeContentVisibility(input.visibility),
        created: input.created ?? now,
        updated: input.updated ?? now,
        content: input.content,
        metadata: input.metadata,
        entityType: input.entityType,
        contentHash: "",
      };
      entityTypes.add(entity.entityType);
      const { content, metadata } = serializeViaAdapter(entity);
      entities.set(id, {
        ...entity,
        content,
        metadata,
        contentHash: computeContentHash(content),
      });
      updateEntityExportIntent(
        entity.entityType,
        id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      return { entityId: id, jobId: `job-${id}`, skipped: false };
    },
    createEntityFromMarkdown: async (request: {
      input: { entityType: string; id: string; markdown: string };
    }): Promise<EntityMutationResult> => {
      const adapter = entityAdapters.get(request.input.entityType);
      const parsed = adapter?.fromMarkdown(request.input.markdown) ?? {
        entityType: request.input.entityType,
        content: request.input.markdown,
        metadata: {},
      };
      const now = new Date().toISOString();
      const entity = {
        ...parsed,
        id: request.input.id,
        entityType: request.input.entityType,
        content: parsed.content ?? request.input.markdown,
        metadata: parsed.metadata ?? {},
        visibility: "public" as const,
        created: now,
        updated: now,
        contentHash: computeContentHash(
          parsed.content ?? request.input.markdown,
        ),
      } as BaseEntity;
      return defaultEntityService.createEntity({ entity });
    },
    updateEntity: async <T extends BaseEntity>(
      request: UpdateEntityRequest<T>,
    ): Promise<EntityMutationResult> => {
      const entity = request.entity;
      if (!entity.id) throw new Error("Entity must have an id");
      const { content, metadata } = serializeViaAdapter(entity);
      const contentHash = computeContentHash(content);
      // Mirror the real entity service: a byte-identical write is skipped —
      // no store, no event, no job.
      const existing = entities.get(entity.id);
      if (
        request.options?.expectedContentHash !== undefined &&
        existing?.contentHash !== request.options.expectedContentHash
      ) {
        return {
          entityId: entity.id,
          jobId: "",
          skipped: true,
          skipReason: "content-conflict" as const,
        };
      }
      if (
        existing?.contentHash === contentHash &&
        existing.visibility === entity.visibility &&
        JSON.stringify(existing.metadata) === JSON.stringify(metadata)
      ) {
        updateEntityExportIntent(
          entity.entityType,
          entity.id,
          "upsert",
          request.options?.persistenceOrigin,
        );
        return { entityId: entity.id, jobId: "", skipped: true };
      }
      entities.set(entity.id, {
        ...entity,
        content,
        metadata,
        contentHash,
      });
      updateEntityExportIntent(
        entity.entityType,
        entity.id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      return { entityId: entity.id, jobId: `job-${entity.id}`, skipped: false };
    },
    deleteEntity: async (request: {
      entityType: string;
      id: string;
      options?: { persistenceOrigin?: "ordinary" | "directory-sync" };
    }): Promise<boolean> => {
      entities.delete(request.id);
      updateEntityExportIntent(
        request.entityType,
        request.id,
        "delete",
        request.options?.persistenceOrigin,
      );
      return true;
    },
    getEntity: async <T extends BaseEntity>(request: {
      entityType: string;
      id: string;
      visibilityScope?: BaseEntity["visibility"];
    }): Promise<T | null> => {
      const entity = entities.get(request.id);
      if (entity?.entityType !== request.entityType) return null;
      if (request.visibilityScope === undefined) return entity as T;
      return getVisibleContentVisibilities(request.visibilityScope).includes(
        entity.visibility,
      )
        ? (entity as T)
        : null;
    },
    listEntities: async <T extends BaseEntity>(
      request: ListEntitiesRequest,
    ): Promise<T[]> => {
      const scope = request.options?.filter?.visibilityScope;
      const visible = scope
        ? new Set(getVisibleContentVisibilities(scope))
        : null;
      let results = Array.from(entities.values()).filter(
        (e) =>
          e.entityType === request.entityType &&
          (visible === null || visible.has(e.visibility)),
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
      return results as T[];
    },
    search: async () => [],
    searchWithDistances: async () => [],
    getEntityTypes: () => Array.from(entityTypes),
    hasEntityType: (type: string) => entityTypes.has(type),
    serializeEntity: (entity: BaseEntity) => JSON.stringify(entity),
    deserializeEntity: (markdown: string) =>
      ({ content: markdown }) as BaseEntity,
    getAsyncJobStatus: async () => ({ status: "completed" as const }),
    upsertEntity: async <T extends BaseEntity>(
      request: UpsertEntityRequest<T>,
    ): Promise<EntityMutationResult & { created: boolean }> => {
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
        visibility: entity.visibility,
        contentHash: computeContentHash(content),
      });
      updateEntityExportIntent(
        entity.entityType,
        id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      return {
        entityId: id,
        jobId: `job-${id}`,
        created: !exists,
        skipped: false,
      };
    },
    getEntityTypeConfig,
    isProjectionOwnedEntity: async () => false,
    listPendingEntityExports: async () =>
      [...entityExportIntents.values()].sort(
        (left, right) => left.markedAt - right.markedAt,
      ),
    hasPendingEntityExports: async () => entityExportIntents.size > 0,
    acknowledgeEntityExports: async (request): Promise<number> => {
      let acknowledged = 0;
      for (const intent of request.intents) {
        const key = exportKey(intent.entityType, intent.entityId);
        if (entityExportIntents.get(key)?.revision !== intent.revision)
          continue;
        entityExportIntents.delete(key);
        acknowledged += 1;
      }
      return acknowledged;
    },
    getWeightMap: () => ({}),
    countEntities: async () => 0,
    getEntityCounts: async (
      visibilityScope?: BaseEntity["visibility"],
    ): Promise<Array<{ entityType: string; count: number }>> => {
      const visible = visibilityScope
        ? new Set(getVisibleContentVisibilities(visibilityScope))
        : null;
      const counts = new Map<string, number>();
      for (const entity of entities.values()) {
        if (visible !== null && !visible.has(entity.visibility)) continue;
        counts.set(entity.entityType, (counts.get(entity.entityType) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([entityType, count]) => ({
        entityType,
        count,
      }));
    },

    // The fake stores serialized entities directly, so there is no separate
    // unresolved form to return.
    getEntityRaw: async <T extends BaseEntity>(
      request: GetEntityRequest,
    ): Promise<T | null> => defaultEntityService.getEntity<T>(request),

    // Embeddings and projections are not modelled: the fake has no vectors, so
    // it reports an empty, ready index rather than pretending to search one.
    storeEmbedding: async (): Promise<void> => {},
    countEmbeddings: async (): Promise<number> => 0,
    backfillMissingEmbeddings: async () => ({ queued: 0, skipped: 0 }),
    isIndexReady: (): boolean => true,
    awaitIndexReady: async () => ({
      ready: true,
      degraded: false,
      activeEmbeddingJobs: 0,
      missingEmbeddings: 0,
      staleEmbeddings: 0,
      failedEmbeddings: 0,
      embeddableEntities: 0,
      embeddedEntities: 0,
    }),
    projectSemanticSpace: async () => ({
      origin: { kind: "centroid" as const },
      points: [],
      neighbors: [],
      distanceRange: { min: 0, max: 0 },
    }),

    reconcileProjectionTargets: async (): Promise<void> => {},
    setProjectionWakeup: () => (): void => {},
    runBulkMutation: async <TResult>(
      _input: { source: string; operationId: string },
      mutation: () => Promise<TResult>,
    ): Promise<TResult> => mutation(),
    prepareDurableBulkMutation: async (): Promise<void> => {},
    finalizeDurableBulkMutationEnqueue: async (): Promise<void> => {},
    failDurableBulkMutationEnqueue: async (): Promise<void> => {},
    runDurableBulkMutationChild: async <TResult>(
      _input: {
        source: string;
        operationId: string;
        rootJobId: string;
        childKey: string;
        expectedChildren: number;
        jobId: string;
      },
      mutation: () => Promise<TResult>,
    ): Promise<TResult> => mutation(),
    settleDurableBulkMutationChild: async () => true,
    recoverProjectionBatches: async () => ({
      fencedCallbacks: 0,
      releasedDurableRoots: 0,
    }),
    // Projection storage is database-backed and cannot be faked usefully. Fail
    // loudly rather than hand back an empty stand-in, which would make a test
    // asserting projection behaviour silently meaningless.
    getProjectionStore: (): never => {
      throw new Error(
        "createMockShell: getProjectionStore is not mocked; use a real entity service for projection tests",
      );
    },

    initialize: async (): Promise<void> => {},
  } satisfies IEntityService;

  // Tests that want canned reads rather than the stateful fake can inject
  // their own; everything built from this shell then sees the same service.
  const entityService = options.entityService ?? defaultEntityService;

  // --- Entity Registry ---
  const createInterceptors = new Map<
    string,
    (input: unknown, executionContext: unknown) => Promise<unknown>
  >();
  const uploadSaveHandlers: UploadSaveHandlerRegistration[] = [];

  const entityRegistry: IEntityRegistry = {
    registerEntityType: (type, _schema, adapter, config) => {
      entityTypes.add(type);
      entityAdapters.set(type, adapter as EntityAdapter<BaseEntity>);
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

  const contentService: IContentService = {
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
  const dataSourceRegistrySurface: PublicSurface<DataSourceRegistry> = {
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
  const dataSourceRegistry = dataSourceRegistrySurface as DataSourceRegistry;

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
    enqueue: async () => `job-${Date.now()}`,
    // The real service reports whether the job was still claimable; the fake
    // has no attempt bookkeeping, so it reports success.
    complete: async () => true,
    fail: async () => true,
    update: async () => true,
    getStatus: async () => null,
    getJobsByRootJobId: async () => [],
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
    getActiveJobs: async () => [],
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

  const renderServiceSurface: PublicSurface<RenderService> = {
    get: () => undefined,
    list: () => [],
    validate: () => true,
    findViewTemplate: () => undefined,
    getRenderer: () => undefined,
    hasRenderer: () => false,
    listFormats: () => [],
  };
  // Only the nominal private-field gap remains; the shape is checked above.
  const renderService = renderServiceSurface as RenderService;

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

    runProjectionRule: async (
      rule: ProjectionRule,
      signal: AbortSignal = new AbortController().signal,
    ): Promise<readonly ProjectionWriteIntent[]> => {
      const input = await rule.selectInput(
        { waveId: "eval", inputs: [] },
        {
          entities: entityService,
          conversations: {
            get: async () => null,
            getMessages: async () => [],
          },
          resolvePrompt: async (
            _reference: string,
            fallback: string,
          ): Promise<string> => fallback,
          appInfo: (): Promise<RuntimeAppInfo> => shell.getAppInfo(),
          identityInput: () => ({}),
        },
        signal,
      );
      const derived = await rule.derive(
        input,
        {
          ai: {
            query: (prompt, context) => shell.query(prompt, context),
            generate: async <T = unknown>(
              config: ContentGenerationConfig,
            ): Promise<T> => shell.generateContent<T>(config),
            generateObject: async <T>(
              prompt: string,
              schema: AIGenerationSchema<T>,
              abort?: AbortSignal,
            ): Promise<{ object: T }> =>
              shell.generateObject(prompt, schema, abort),
            generateImage: async (
              prompt: string,
              options?: ImageGenerationOptions,
            ): Promise<ImageGenerationResult> =>
              shell.generateImage(prompt, options),
          },
          logger,
        },
        signal,
      );
      // An eval measures what a rule would write. Abstaining writes nothing,
      // which is what the caller is asking about — the distinction only
      // matters to the runtime deciding whether to reconcile.
      return Array.isArray(derived) ? derived : [];
    },

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
