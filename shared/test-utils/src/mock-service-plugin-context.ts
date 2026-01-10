import { mock } from "bun:test";
import type {
  ServicePluginContext,
  IEntityService,
  Logger,
  BaseEntity,
} from "@brains/plugins";
import {
  createMockEntityService,
  type MockEntityServiceReturns,
} from "./mock-entity-service";
import { createMockLogger } from "./mock-logger";

/**
 * Return value configuration for mock service plugin context methods
 */
export interface MockServicePluginContextReturns {
  /** Return values for entity service methods */
  entityService?: MockEntityServiceReturns;
  /** Return value for generateContent */
  generateContent?: Record<string, unknown>;
  /** Return value for enqueueJob */
  enqueueJob?: string;
}

/**
 * Options for creating a mock service plugin context
 */
export interface MockServicePluginContextOptions {
  /** Custom entity service mock (overrides returns.entityService) */
  entityService?: IEntityService;
  /** Custom logger mock */
  logger?: Logger;
  /** Entity types to register */
  entityTypes?: string[];
  /** Plugin ID */
  pluginId?: string;
  /** Data directory path */
  dataDir?: string;
  /** Pre-configured return values for methods */
  returns?: MockServicePluginContextReturns;
  /** Dynamic implementation for listEntities */
  listEntitiesImpl?: (type: string) => Promise<BaseEntity[]>;
}

/**
 * Create a mock ServicePluginContext for testing
 *
 * Returns a ServicePluginContext-typed object where all methods are bun mock functions.
 * The cast is centralized here so test files don't need `as unknown as` casts.
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const mockContext = createMockServicePluginContext();
 *
 * // With pre-configured return values (no casts needed!)
 * const mockContext = createMockServicePluginContext({
 *   entityTypes: ["note", "post"],
 *   returns: {
 *     entityService: {
 *       getEntity: mockEntity,
 *       deleteEntity: true,
 *     },
 *     generateContent: { title: "Generated Title" },
 *     enqueueJob: "job-123",
 *   }
 * });
 *
 * // Use in handler/tool tests
 * const result = await myTool.execute(input, mockContext);
 *
 * // Verify interactions
 * expect(mockContext.enqueueJob).toHaveBeenCalledWith("my-job", expect.any(Object));
 * ```
 */
export function createMockServicePluginContext(
  options: MockServicePluginContextOptions = {},
): ServicePluginContext {
  const {
    entityTypes = [],
    pluginId = "test-plugin",
    dataDir = "/tmp/test-data",
    returns = {},
    listEntitiesImpl,
  } = options;

  const entityService =
    options.entityService ??
    createMockEntityService({
      entityTypes,
      ...(listEntitiesImpl ? { listEntitiesImpl } : {}),
      ...(returns.entityService ? { returns: returns.entityService } : {}),
    });
  const logger = options.logger ?? createMockLogger();

  return {
    // Services
    entityService,
    logger,

    // Entity registration
    registerEntityType: mock(() => {}),
    registerDataSource: mock(() => {}),

    // Content generation
    generateContent: mock(() => Promise.resolve(returns.generateContent ?? {})),
    formatContent: mock(() => ""),
    parseContent: mock(() => ({})),

    // Conversation
    searchConversations: mock(() => Promise.resolve([])),
    getMessages: mock(() => Promise.resolve([])),

    // Job queue
    enqueueJob: mock(() =>
      Promise.resolve(returns.enqueueJob ?? "mock-job-id"),
    ),
    enqueueBatch: mock(() => Promise.resolve("mock-batch-id")),
    registerJobHandler: mock(() => {}),
    getJobStatus: mock(() => Promise.resolve(null)),

    // Render/templates
    getViewTemplate: mock(() => undefined),
    listViewTemplates: mock(() => []),
    getRenderService: mock(() => ({})),
    resolveContent: mock(() => Promise.resolve(null)),
    getTemplateCapabilities: mock(() => null),
    registerTemplates: mock(() => {}),

    // Plugin metadata
    getPluginPackageName: mock(() => undefined),
    registerEvalHandler: mock(() => {}),

    // Core context methods
    sendMessage: mock(() => Promise.resolve()),
    onMessage: mock(() => () => {}),
    subscribe: mock(() => () => {}),
    registerTool: mock(() => {}),
    registerTemplate: mock(() => {}),
    getTemplate: mock(() => undefined),
    listTemplates: mock(() => []),

    // Properties
    pluginId,
    dataDir,
  } as unknown as ServicePluginContext;
}
