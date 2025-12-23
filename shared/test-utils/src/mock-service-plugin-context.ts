import { mock } from "bun:test";
import type { ServicePluginContext } from "@brains/plugins";
import {
  createMockEntityService,
  asMockEntityService,
  type MockEntityService,
} from "./mock-entity-service";
import { createMockLogger, type MockLogger } from "./mock-logger";

/**
 * Options for creating a mock service plugin context
 */
export interface MockServicePluginContextOptions {
  /** Custom entity service mock */
  entityService?: MockEntityService;
  /** Custom logger mock */
  logger?: MockLogger;
  /** Entity types to register */
  entityTypes?: string[];
  /** Plugin ID */
  pluginId?: string;
  /** Data directory path */
  dataDir?: string;
}

/**
 * Mock service plugin context type with accessible mock methods
 */
export interface MockServicePluginContext {
  // Mocked services
  entityService: MockEntityService;
  logger: MockLogger;

  // Mocked methods
  registerEntityType: ReturnType<typeof mock>;
  registerDataSource: ReturnType<typeof mock>;
  generateContent: ReturnType<typeof mock>;
  formatContent: ReturnType<typeof mock>;
  parseContent: ReturnType<typeof mock>;
  searchConversations: ReturnType<typeof mock>;
  getMessages: ReturnType<typeof mock>;
  enqueueJob: ReturnType<typeof mock>;
  enqueueBatch: ReturnType<typeof mock>;
  registerJobHandler: ReturnType<typeof mock>;
  getJobStatus: ReturnType<typeof mock>;
  getViewTemplate: ReturnType<typeof mock>;
  listViewTemplates: ReturnType<typeof mock>;
  getRenderService: ReturnType<typeof mock>;
  resolveContent: ReturnType<typeof mock>;
  getTemplateCapabilities: ReturnType<typeof mock>;
  getPluginPackageName: ReturnType<typeof mock>;
  registerEvalHandler: ReturnType<typeof mock>;

  // Core context methods
  sendMessage: ReturnType<typeof mock>;
  onMessage: ReturnType<typeof mock>;
  registerTool: ReturnType<typeof mock>;
  registerTemplate: ReturnType<typeof mock>;
  getTemplate: ReturnType<typeof mock>;
  listTemplates: ReturnType<typeof mock>;

  // Properties
  pluginId: string;
  dataDir: string;
}

/**
 * Create a mock ServicePluginContext for testing
 *
 * @example
 * ```typescript
 * const mockContext = createMockServicePluginContext({
 *   entityTypes: ["note", "post"],
 * });
 *
 * // Configure specific behavior
 * mockContext.entityService.getEntity.mockResolvedValue(myEntity);
 * mockContext.generateContent.mockResolvedValue({ title: "Generated" });
 *
 * // Use in handler/tool tests
 * const result = await myTool.execute(input, mockContext);
 *
 * // Verify interactions
 * expect(mockContext.enqueueJob).toHaveBeenCalledWith("my-job", { ... });
 * ```
 */
export function createMockServicePluginContext(
  options: MockServicePluginContextOptions = {},
): MockServicePluginContext {
  const {
    entityTypes = [],
    pluginId = "test-plugin",
    dataDir = "/tmp/test-data",
  } = options;

  const entityService =
    options.entityService ?? createMockEntityService({ entityTypes });
  const logger = options.logger ?? createMockLogger();

  return {
    // Services
    entityService,
    logger,

    // Entity registration
    registerEntityType: mock(() => {}),
    registerDataSource: mock(() => {}),

    // Content generation
    generateContent: mock(() => Promise.resolve({})),
    formatContent: mock(() => ""),
    parseContent: mock(() => ({})),

    // Conversation
    searchConversations: mock(() => Promise.resolve([])),
    getMessages: mock(() => Promise.resolve([])),

    // Job queue
    enqueueJob: mock(() => Promise.resolve("mock-job-id")),
    enqueueBatch: mock(() => Promise.resolve("mock-batch-id")),
    registerJobHandler: mock(() => {}),
    getJobStatus: mock(() => Promise.resolve(null)),

    // Render/templates
    getViewTemplate: mock(() => undefined),
    listViewTemplates: mock(() => []),
    getRenderService: mock(() => ({})),
    resolveContent: mock(() => Promise.resolve(null)),
    getTemplateCapabilities: mock(() => null),

    // Plugin metadata
    getPluginPackageName: mock(() => undefined),
    registerEvalHandler: mock(() => {}),

    // Core context methods
    sendMessage: mock(() => Promise.resolve()),
    onMessage: mock(() => () => {}),
    registerTool: mock(() => {}),
    registerTemplate: mock(() => {}),
    getTemplate: mock(() => undefined),
    listTemplates: mock(() => []),

    // Properties
    pluginId,
    dataDir,
  };
}

/**
 * Cast MockServicePluginContext to ServicePluginContext for type compatibility
 */
export function asMockServicePluginContext(
  mockContext: MockServicePluginContext,
): ServicePluginContext {
  return {
    ...mockContext,
    entityService: asMockEntityService(mockContext.entityService),
    logger: mockContext.logger,
  } as unknown as ServicePluginContext;
}
