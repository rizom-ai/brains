import { mock } from "bun:test";
import type {
  ServicePluginContext,
  IEntityService,
  BaseEntity,
  MessageSendRequest,
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
  /** Return value for jobs.enqueue */
  jobsEnqueue?: string;
  /** Custom messaging.send implementation */
  messagingSend?: (request: MessageSendRequest) => Promise<unknown>;
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
  /** Shared conversation spaces */
  spaces?: string[];
  /** Pre-configured return values for methods */
  returns?: MockServicePluginContextReturns;
  /** Dynamic implementation for listEntities */
  listEntitiesImpl?: (request: { entityType: string }) => Promise<BaseEntity[]>;
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
    spaces = [],
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

    // App metadata
    appInfo: mock(() =>
      Promise.resolve({
        version: "0.0.0",
        model: "test-model",
        plugins: [],
      }),
    ),

    // Domain (top-level, like dataDir)
    domain: undefined,
    spaces,
    siteUrl: undefined,
    previewUrl: undefined,

    // Conversations namespace (read-only)
    conversations: {
      get: mock(() => Promise.resolve(null)),
      search: mock(() => Promise.resolve([])),
      list: mock(() => Promise.resolve([])),
      getMessages: mock(() => Promise.resolve([])),
      countMessages: mock(() => Promise.resolve(0)),
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
      register: mock((_templates?: unknown, _namespace?: string) => {}),
      format: mock(() => ""),
      parse: mock(() => ({})),
      resolve: mock(() => Promise.resolve(null)),
      getCapabilities: mock(() => null),
    },

    // Views namespace
    views: {
      get: mock(() => undefined),
      list: mock(() => []),
      hasRenderer: mock(() => false),
      getRenderer: mock(() => undefined),
      validate: mock(() => true),
    },

    // Prompt resolution
    prompts: {
      resolve: mock((_target: string, fallback: string) =>
        Promise.resolve(fallback),
      ),
    },

    // Eval namespace
    eval: {
      registerHandler: mock(() => {}),
    },

    // Messaging namespace
    messaging: {
      send: mock(
        returns.messagingSend ?? ((): Promise<void> => Promise.resolve()),
      ),
      subscribe: mock(() => () => {}),
    },

    // Properties
    pluginId,
    dataDir,
  } as unknown as ServicePluginContext;
}
