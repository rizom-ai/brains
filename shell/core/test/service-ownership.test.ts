import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { IEmbeddingService } from "@brains/entity-service";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  JobQueueService,
  type IJobQueueWorker,
  type JobQueueWorkerStats,
} from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { MessageBus } from "@brains/messaging-service";
import type { Plugin } from "@brains/plugins";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import {
  createMockJobQueueService,
  createSilentLogger,
} from "@brains/test-utils";
import type { ShellConfigInput } from "../src/config";
import { resetAllSingletons } from "../src/initialization/reset";
import { Shell, type ShellDependencies } from "../src/shell";
import { createTestDirectory } from "./helpers/test-db";

interface TestDirectory {
  dir: string;
  cleanup(): Promise<void>;
}

interface DependencyAuditEntry {
  honoredByCore: boolean;
  cleanup: "none" | "close" | "shutdown" | "stop";
}

const dependencyAudit: Record<keyof ShellDependencies, DependencyAuditEntry> = {
  logger: { honoredByCore: true, cleanup: "none" },
  embeddingService: { honoredByCore: true, cleanup: "none" },
  aiService: { honoredByCore: true, cleanup: "none" },
  entityService: { honoredByCore: true, cleanup: "close" },
  conversationService: { honoredByCore: true, cleanup: "close" },
  entityRegistry: { honoredByCore: true, cleanup: "none" },
  messageBus: { honoredByCore: true, cleanup: "none" },
  renderService: { honoredByCore: true, cleanup: "none" },
  daemonRegistry: { honoredByCore: true, cleanup: "shutdown" },
  pluginManager: { honoredByCore: true, cleanup: "shutdown" },
  mcpService: { honoredByCore: true, cleanup: "none" },
  contentService: { honoredByCore: true, cleanup: "none" },
  jobQueueService: { honoredByCore: true, cleanup: "close" },
  jobQueueWorker: { honoredByCore: true, cleanup: "stop" },
  jobProgressMonitor: { honoredByCore: true, cleanup: "stop" },
  batchJobManager: { honoredByCore: true, cleanup: "stop" },
  permissionService: { honoredByCore: true, cleanup: "none" },
  templateRegistry: { honoredByCore: true, cleanup: "none" },
  dataSourceRegistry: { honoredByCore: true, cleanup: "none" },
  attachmentRegistry: { honoredByCore: true, cleanup: "none" },
  runtimeUploadRegistry: { honoredByCore: true, cleanup: "none" },
  runtimeStateService: { honoredByCore: true, cleanup: "close" },
  recurringCheckService: { honoredByCore: true, cleanup: "stop" },
};

const logger = createSilentLogger("service-ownership");

const embeddingService: IEmbeddingService = {
  dimensions: 1536,
  generateEmbedding: async () => ({
    embedding: new Float32Array(1536).fill(0.1),
    usage: { tokens: 1 },
  }),
  generateEmbeddings: async (texts) => ({
    embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
    usage: { tokens: texts.length },
  }),
};

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/entities.db` },
    embeddingDatabase: { url: `file:${dir}/embeddings.db` },
    jobQueueDatabase: { url: `file:${dir}/jobs.db` },
    conversationDatabase: { url: `file:${dir}/conversations.db` },
    runtimeStateDatabase: { url: `file:${dir}/runtime-state.db` },
    ai: {
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    },
    logging: { level: "error" },
  };
}

async function migrateTestDatabases(dir: string): Promise<void> {
  await migrateEntities({ url: `file:${dir}/entities.db` });
  await migrateJobQueue({ url: `file:${dir}/jobs.db` });
  await migrateConversations({ url: `file:${dir}/conversations.db` });
  await migrateRuntimeState({ url: `file:${dir}/runtime-state.db` });
}

function defaultDependencies(): ShellDependencies {
  return { logger, embeddingService };
}

function createToolPlugin(id: string): Plugin {
  return {
    id,
    packageName: `@test/${id}`,
    version: "1.0.0",
    type: "service",
    description: `Registers ${id}`,
    register: async () => ({
      tools: [
        {
          name: `${id}_tool`,
          description: `Tool from ${id}`,
          inputSchema: {},
          handler: async () => ({ success: true, data: {} }),
        },
      ],
      resources: [],
    }),
  };
}

async function shutdownIgnoringFailure(shell: Shell): Promise<void> {
  try {
    await shell.shutdown();
  } catch {
    // An ownership assertion must not be hidden by repeated cleanup.
  }
}

describe("Shell service ownership", () => {
  const directories: TestDirectory[] = [];
  const shells: Shell[] = [];

  beforeEach(async () => {
    await resetAllSingletons();
  });

  afterEach(async () => {
    for (const shell of shells.splice(0).reverse()) {
      await shutdownIgnoringFailure(shell);
    }
    await resetAllSingletons();
    for (const directory of directories.splice(0).reverse()) {
      await directory.cleanup();
    }
  });

  async function createDirectory(): Promise<TestDirectory> {
    const directory = await createTestDirectory();
    directories.push(directory);
    return directory;
  }

  async function createInitializedShell(): Promise<Shell> {
    const directory = await createDirectory();
    await migrateTestDatabases(directory.dir);
    const shell = Shell.createFresh(
      createTestConfig(directory.dir),
      defaultDependencies(),
    );
    shells.push(shell);
    await shell.initialize({ mode: "register-only" });
    return shell;
  }

  it("audits every ShellDependencies override without ignored services", () => {
    const ignoredOverrides = Object.entries(dependencyAudit)
      .filter(([, entry]) => !entry.honoredByCore)
      .map(([name]) => name)
      .sort();

    expect(ignoredOverrides).toEqual([]);
  });

  it("keeps shell A usable when shell B is constructed before A shuts down", async () => {
    const shellA = await createInitializedShell();
    const shellB = await createInitializedShell();

    expect({
      agentService: shellA.getAgentService() === shellB.getAgentService(),
      aiService: shellA.getAIService() === shellB.getAIService(),
      contentService: shellA.getContentService() === shellB.getContentService(),
      conversationService:
        shellA.getConversationService() === shellB.getConversationService(),
      dataSourceRegistry:
        shellA.getDataSourceRegistry() === shellB.getDataSourceRegistry(),
      entityRegistry: shellA.getEntityRegistry() === shellB.getEntityRegistry(),
      entityService: shellA.getEntityService() === shellB.getEntityService(),
      jobQueueService:
        shellA.getJobQueueService() === shellB.getJobQueueService(),
      mcpService: shellA.getMCPService() === shellB.getMCPService(),
      messageBus: shellA.getMessageBus() === shellB.getMessageBus(),
      permissionService:
        shellA.getPermissionService() === shellB.getPermissionService(),
      pluginManager: shellA.getPluginManager() === shellB.getPluginManager(),
      renderService: shellA.getRenderService() === shellB.getRenderService(),
      runtimeState: shellA.getRuntimeState() === shellB.getRuntimeState(),
    }).toEqual({
      agentService: false,
      aiService: false,
      contentService: false,
      conversationService: false,
      dataSourceRegistry: false,
      entityRegistry: false,
      entityService: false,
      jobQueueService: false,
      mcpService: false,
      messageBus: false,
      permissionService: false,
      pluginManager: false,
      renderService: false,
      runtimeState: false,
    });

    const entities = await shellA.getEntityService().listEntities({
      entityType: "note",
    });
    expect(entities).toEqual([]);
  });

  it("keeps each shell bound to its own initializer config", async () => {
    const directoryA = await createDirectory();
    const directoryB = await createDirectory();
    await migrateTestDatabases(directoryA.dir);
    await migrateTestDatabases(directoryB.dir);

    const configA = createTestConfig(directoryA.dir);
    configA.plugins = [createToolPlugin("shell-a")];
    const configB = createTestConfig(directoryB.dir);
    configB.plugins = [createToolPlugin("shell-b")];

    const shellA = Shell.createFresh(configA, defaultDependencies());
    const shellB = Shell.createFresh(configB, defaultDependencies());
    shells.push(shellA, shellB);

    await shellA.initialize({ mode: "register-only" });
    await shellB.initialize({ mode: "register-only" });

    const shellATools = shellA
      .getMCPService()
      .listTools()
      .map(({ tool }) => tool.name)
      .filter((name) => name.startsWith("shell-"));
    const shellBTools = shellB
      .getMCPService()
      .listTools()
      .map(({ tool }) => tool.name)
      .filter((name) => name.startsWith("shell-"));

    expect(shellATools).toEqual(["shell-a_tool"]);
    expect(shellBTools).toEqual(["shell-b_tool"]);
  });

  it("recreates Shell.getInstance without resetting package services", async () => {
    const directoryA = await createDirectory();
    const directoryB = await createDirectory();
    await migrateTestDatabases(directoryA.dir);
    await migrateTestDatabases(directoryB.dir);

    const shellA = Shell.getInstance(createTestConfig(directoryA.dir));
    await shellA.initialize({ mode: "register-only" });
    await Shell.resetInstance();

    const shellB = Shell.getInstance(createTestConfig(directoryB.dir));
    await shellB.initialize({ mode: "register-only" });

    expect(shellB).not.toBe(shellA);
    expect(
      await shellB.getEntityService().listEntities({ entityType: "note" }),
    ).toEqual([]);

    await Shell.resetInstance();
  });

  it("keeps shell A usable when construction of shell B fails", async () => {
    const shellA = await createInitializedShell();
    const directoryB = await createDirectory();
    const configB = createTestConfig(directoryB.dir);
    configB.database = { url: "invalid://entity-database" };

    let constructionError: unknown;
    try {
      const shellB = Shell.createFresh(configB, defaultDependencies());
      shells.push(shellB);
    } catch (error) {
      constructionError = error;
    }

    expect(constructionError).toBeDefined();
    const entities = await shellA.getEntityService().listEntities({
      entityType: "note",
    });
    expect(entities).toEqual([]);
  });

  it("honors the advertised entity service and registry overrides", async () => {
    const directory = await createDirectory();
    await migrateTestDatabases(directory.dir);

    const messageBus = MessageBus.createFresh(logger);
    const jobQueueService = JobQueueService.createFresh(
      { url: `file:${directory.dir}/jobs.db` },
      logger,
    );
    await jobQueueService.initialize();
    const entityRegistry = EntityRegistry.createFresh(logger);
    const entityService = EntityService.createFresh({
      dbConfig: { url: `file:${directory.dir}/entities.db` },
      embeddingDbConfig: {
        url: `file:${directory.dir}/embeddings.db`,
      },
      embeddingService,
      entityRegistry,
      jobQueueService,
      messageBus,
      logger,
    });
    await entityService.initialize();

    let installedEntityService = false;
    let shell: Shell | undefined;
    try {
      shell = Shell.createFresh(createTestConfig(directory.dir), {
        ...defaultDependencies(),
        entityService,
        entityRegistry,
      });
      shells.push(shell);
      await shell.initialize({ mode: "register-only" });

      installedEntityService = shell.getEntityService() === entityService;
      expect({
        entityService: installedEntityService,
        entityRegistry: shell.getEntityRegistry() === entityRegistry,
      }).toEqual({ entityService: true, entityRegistry: true });

      await shell.shutdown();
      let queryError: unknown;
      try {
        await entityService.listEntities({ entityType: "note" });
      } catch (error) {
        queryError = error;
      }
      const errorText =
        String(queryError) +
        (queryError instanceof Error && queryError.cause
          ? String(queryError.cause)
          : "");
      expect(errorText).toContain("CLIENT_CLOSED");
    } finally {
      if (!installedEntityService) entityService.close();
      jobQueueService.close();
    }
  });

  it("preserves runtime-before-database shutdown order and cleans overrides once", async () => {
    const order: string[] = [];
    const directory = await createDirectory();
    await migrateTestDatabases(directory.dir);

    const jobQueueService = createMockJobQueueService();
    jobQueueService.close = (): void => {
      order.push("job-database");
    };
    const jobQueueWorker = {
      start: async (): Promise<void> => {},
      stop: async (): Promise<void> => {
        order.push("job-runtime");
      },
      getStats: (): JobQueueWorkerStats => ({
        processedJobs: 0,
        failedJobs: 0,
        activeJobs: 0,
        uptime: 0,
        isRunning: false,
      }),
      isWorkerRunning: (): boolean => false,
    } satisfies IJobQueueWorker;

    const runtimeStateService = RuntimeStateService.createFresh(
      { url: `file:${directory.dir}/runtime-state.db` },
      logger,
    );
    const closeRuntimeState =
      runtimeStateService.close.bind(runtimeStateService);
    runtimeStateService.close = (): void => {
      order.push("runtime-state-database");
      closeRuntimeState();
    };

    const messageBus = MessageBus.createFresh(logger);
    const entityRegistry = EntityRegistry.createFresh(logger);
    const entityService = EntityService.createFresh({
      dbConfig: { url: `file:${directory.dir}/entities.db` },
      embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
      embeddingService,
      entityRegistry,
      jobQueueService,
      messageBus,
      logger,
    });
    const closeEntity = entityService.close.bind(entityService);
    entityService.close = (): void => {
      order.push("entity-database");
      closeEntity();
    };

    const daemonPlugin: Plugin = {
      id: "service-ownership-order",
      packageName: "@test/service-ownership-order",
      version: "1.0.0",
      type: "service",
      description: "Records shell shutdown order",
      register: async (shell) => {
        shell.registerDaemon(
          "service-ownership-order",
          {
            start: async (): Promise<void> => {},
            stop: async (): Promise<void> => {
              order.push("plugins");
            },
          },
          "service-ownership-order",
        );
        return { tools: [], resources: [] };
      },
    };

    const config = createTestConfig(directory.dir);
    config.plugins = [daemonPlugin];
    const shell = Shell.createFresh(config, {
      ...defaultDependencies(),
      jobQueueService,
      jobQueueWorker,
      runtimeStateService,
      messageBus,
      entityRegistry,
      entityService,
    });
    shells.push(shell);

    const agentService = shell.getAgentService();
    const shutdownAgent = agentService.shutdown?.bind(agentService);
    agentService.shutdown = async (): Promise<void> => {
      order.push("agent");
      await shutdownAgent?.();
    };

    const conversationService = shell.getConversationService();
    const closeConversation =
      conversationService.close.bind(conversationService);
    conversationService.close = (): void => {
      order.push("conversation-database");
      closeConversation();
    };

    await shell.initialize();
    order.length = 0;

    await shell.shutdown();
    await shell.shutdown();

    expect(order).toEqual([
      "job-runtime",
      "plugins",
      "agent",
      "conversation-database",
      "entity-database",
      "job-database",
      "runtime-state-database",
    ]);
  });
});
