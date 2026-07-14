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

const dependencyAudit = {
  logger: { honoredByCore: true, cleanup: "none" },
  embeddingService: { honoredByCore: true, cleanup: "none" },
  aiService: { honoredByCore: true, cleanup: "none" },
  entityService: { honoredByCore: false, cleanup: "close" },
  conversationService: { honoredByCore: true, cleanup: "close" },
  entityRegistry: { honoredByCore: false, cleanup: "none" },
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
} satisfies Record<keyof ShellDependencies, DependencyAuditEntry>;

const logger = createSilentLogger("service-ownership-characterization");

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

async function shutdownIgnoringFailure(shell: Shell): Promise<void> {
  try {
    await shell.shutdown();
  } catch {
    // A characterization assertion must not be hidden by repeated cleanup.
  }
}

describe("Shell service ownership characterization", () => {
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

  it("audits every ShellDependencies override and records current gaps", () => {
    const ignoredOverrides = Object.entries(dependencyAudit)
      .filter(([, entry]) => !entry.honoredByCore)
      .map(([name]) => name)
      .sort();

    expect(ignoredOverrides).toEqual(["entityRegistry", "entityService"]);
  });

  // These expected-failure tests encode the Phase 1 contract. Converting them
  // from `it.failing` to `it` is the acceptance gate for fresh composition.
  it.failing(
    "keeps shell A usable when shell B is constructed before A shuts down",
    async () => {
      const shellA = await createInitializedShell();
      await createInitializedShell();

      const entities = await shellA.getEntityService().listEntities({
        entityType: "note",
      });
      expect(entities).toEqual([]);
    },
  );

  it.failing(
    "keeps shell A usable when construction of shell B fails",
    async () => {
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
    },
  );

  it.failing(
    "honors the advertised entity service and registry overrides",
    async () => {
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
      } finally {
        if (!installedEntityService) entityService.close();
        jobQueueService.close();
      }
    },
  );

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

    const entityService = EntityService.getInstance({
      dbConfig: { url: `file:${directory.dir}/entities.db` },
      embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
      embeddingService,
      entityRegistry: EntityRegistry.getInstance(logger),
      jobQueueService,
      messageBus: shell.getMessageBus(),
      logger,
    });
    const closeEntity = entityService.close.bind(entityService);
    entityService.close = (): void => {
      order.push("entity-database");
      closeEntity();
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
