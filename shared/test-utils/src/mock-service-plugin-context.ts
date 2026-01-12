import { mock } from "bun:test";
import type {
  ServicePluginContext,
  IEntityService,
  BaseEntity,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
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
  /** Return value for jobs.enqueue */
  jobsEnqueue?: string;
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
 *     jobsEnqueue: "job-123",
 *   }
 * });
 *
 * // Use in handler/tool tests
 * const result = await myTool.execute(input, mockContext);
 *
 * // Verify interactions
 * expect(mockContext.jobs.enqueue).toHaveBeenCalledWith("my-job", expect.any(Object), null);
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

    // Entity management namespace
    entities: {
      register: mock(() => {}),
      getAdapter: mock(() => undefined),
      update: mock(() =>
        Promise.resolve({ entityId: "mock-id", jobId: "mock-job" }),
      ),
      registerDataSource: mock(() => {}),
    },

    // AI operations namespace
    ai: {
      query: mock(() => Promise.resolve({ message: "mock response" })),
      generate: mock(() => Promise.resolve(returns.generateContent ?? {})),
      generateImage: mock(() =>
        Promise.resolve({ url: "mock-url", revisedPrompt: "mock prompt" }),
      ),
      canGenerateImages: mock(() => false),
    },

    // Identity namespace
    identity: {
      get: mock(() => ({ name: "Test Brain", values: [] })),
      getProfile: mock(() => ({ name: "Test Profile", role: "", purpose: "" })),
      getAppInfo: mock(() =>
        Promise.resolve({
          version: "0.0.0",
          model: "test-model",
          plugins: [],
        }),
      ),
    },

    // Conversations namespace (read-only)
    conversations: {
      get: mock(() => Promise.resolve(null)),
      search: mock(() => Promise.resolve([])),
      getMessages: mock(() => Promise.resolve([])),
    },

    // Job queue namespace
    jobs: {
      enqueue: mock(() =>
        Promise.resolve(returns.jobsEnqueue ?? "mock-job-id"),
      ),
      enqueueBatch: mock(() => Promise.resolve("mock-batch-id")),
      registerHandler: mock(() => {}),
      getStatus: mock(() => Promise.resolve(null)),
      getActiveJobs: mock(() => Promise.resolve([])),
      getActiveBatches: mock(() => Promise.resolve([])),
      getBatchStatus: mock(() => Promise.resolve(null)),
    },

    // Template operations namespace
    templates: {
      register: mock(() => {}),
      format: mock(() => ""),
      parse: mock(() => ({})),
      resolve: mock(() => Promise.resolve(null)),
      getCapabilities: mock(() => null),
    },

    // Views namespace
    views: {
      get: mock(() => undefined),
      list: mock(() => []),
      getRenderService: mock(() => ({})),
    },

    // Plugins namespace
    plugins: {
      getPackageName: mock(() => undefined),
    },

    // Eval namespace
    eval: {
      registerHandler: mock(() => {}),
    },

    // Messaging namespace
    messaging: {
      send: mock(() => Promise.resolve()),
      subscribe: mock(() => () => {}),
    },

    // Other core context methods
    onMessage: mock(() => () => {}),
    registerTool: mock(() => {}),
    registerTemplate: mock(() => {}),
    getTemplate: mock(() => undefined),
    listTemplates: mock(() => []),

    // Properties
    pluginId,
    dataDir,
  } as unknown as ServicePluginContext;
}
