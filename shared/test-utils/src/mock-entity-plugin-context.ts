import { mock } from "bun:test";
import type {
  EntityPluginContext,
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
 * Return value configuration for AI namespace methods
 */
export interface MockAIReturns {
  canGenerateImages?: boolean;
  generateImage?: { base64: string; dataUrl: string };
  generateImageError?: Error;
  generate?: Record<string, unknown>;
  generateObject?: unknown;
}

/**
 * Options for creating a mock entity plugin context
 */
export interface MockEntityPluginContextOptions {
  entityService?: IEntityService;
  logger?: Logger;
  entityTypes?: string[];
  pluginId?: string;
  dataDir?: string;
  returns?: {
    entityService?: MockEntityServiceReturns;
    ai?: MockAIReturns;
    jobsEnqueue?: string;
    messagingSend?: (request: MessageSendRequest) => Promise<unknown>;
  };
  listEntitiesImpl?: (type: string) => Promise<BaseEntity[]>;
}

/**
 * Create a mock EntityPluginContext for testing entity plugin handlers.
 *
 * Includes AI namespace (generate, generateImage, generateObject).
 */
export function createMockEntityPluginContext(
  options: MockEntityPluginContextOptions = {},
): EntityPluginContext {
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
    entityService,
    logger,
    pluginId,
    dataDir,

    entities: {
      register: mock(() => {}),
      getAdapter: mock(() => undefined),
      extendFrontmatterSchema: mock(() => {}),
      getEffectiveFrontmatterSchema: mock(() => undefined),
      update: mock(() =>
        Promise.resolve({ entityId: "mock-id", jobId: "mock-job" }),
      ),
      registerDataSource: mock(() => {}),
    },

    ai: {
      query: mock(() => Promise.resolve({ message: "mock response" })),
      generate: mock(() => Promise.resolve(returns.ai?.generate ?? {})),
      generateImage: mock(() => {
        if (returns.ai?.generateImageError) {
          return Promise.reject(returns.ai.generateImageError);
        }
        return Promise.resolve(
          returns.ai?.generateImage ?? {
            base64: "mock-base64",
            dataUrl: "data:image/png;base64,mock-base64",
          },
        );
      }),
      canGenerateImages: mock(() => returns.ai?.canGenerateImages ?? false),
      generateObject: mock(() =>
        Promise.resolve({ object: returns.ai?.generateObject ?? {} }),
      ),
    },

    prompts: {
      resolve: mock((_target: string, fallback: string) =>
        Promise.resolve(fallback),
      ),
    },

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

    appInfo: mock(() =>
      Promise.resolve({
        version: "0.0.0",
        model: "test-model",
        plugins: [],
      }),
    ),

    domain: undefined,
    siteUrl: undefined,
    previewUrl: undefined,

    conversations: {
      get: mock(() => Promise.resolve(null)),
      search: mock(() => Promise.resolve([])),
      getMessages: mock(() => Promise.resolve([])),
    },

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

    eval: {
      registerHandler: mock(() => {}),
    },

    messaging: {
      send: mock(
        returns.messagingSend ?? ((): Promise<void> => Promise.resolve()),
      ),
      subscribe: mock(() => () => {}),
    },
  } as unknown as EntityPluginContext;
}
