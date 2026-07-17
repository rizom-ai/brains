import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import type { Plugin } from "@brains/plugins";
import type { ShellConfigInput } from "../src/config";
import { resetAllSingletons } from "../src/initialization/reset";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { z } from "@brains/utils/zod";

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/test-jobs.db` },
    conversationDatabase: { url: `file:${dir}/test-conv.db` },
    runtimeStateDatabase: { url: `file:${dir}/test-runtime-state.db` },
    embeddingDatabase: { url: `file:${dir}/test-embeddings.db` },
    ai: {
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    },
    embedding: {
      cacheDir: `${dir}/embeddings`,
      model: "fast-all-MiniLM-L6-v2",
    },
  };
}

async function runMigrations(dir: string): Promise<void> {
  await migrateEntities({ url: `file:${dir}/test.db` });
  await migrateJobQueue({ url: `file:${dir}/test-jobs.db` });
  await migrateConversations({ url: `file:${dir}/test-conv.db` });
  await migrateRuntimeState({ url: `file:${dir}/test-runtime-state.db` });
}

const mockEmbeddingService = {
  dimensions: 1536,
  generateEmbedding: async (): Promise<{
    embedding: Float32Array;
    usage: { tokens: number };
  }> => ({
    embedding: new Float32Array(1536).fill(0.1),
    usage: { tokens: 10 },
  }),
  generateEmbeddings: async (
    texts: string[],
  ): Promise<{
    embeddings: Float32Array[];
    usage: { tokens: number };
  }> => ({
    embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
    usage: { tokens: texts.length * 10 },
  }),
};

const deps: ShellDependencies = {
  logger: createSilentLogger(),
  embeddingService: mockEmbeddingService,
};

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("Shell shutdown", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };

  beforeEach(async (): Promise<void> => {
    testDir = await createTestDirectory();
    await resetAllSingletons();
  });

  afterEach(async (): Promise<void> => {
    await resetAllSingletons();
    await testDir.cleanup();
  });

  it("should close entity database connection on shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();

    const entityService = shell.getEntityService();

    // Verify DB works before shutdown
    const result = await entityService.listEntities({
      entityType: "note",
    });
    expect(result).toEqual([]);

    await shell.shutdown();

    // After shutdown, entity DB client should be closed.
    let threw = false;
    try {
      await entityService.listEntities({
        entityType: "note",
      });
    } catch (e: unknown) {
      threw = true;
      const fullError =
        String(e) + (e instanceof Error && e.cause ? String(e.cause) : "");
      expect(fullError).toContain("CLIENT_CLOSED");
    }
    expect(threw).toBe(true);
  });

  it("should close job queue database connection on shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();

    const jobQueueService = shell.getJobQueueService();

    // Verify DB works before shutdown
    const stats = await jobQueueService.getStats();
    expect(stats).toBeDefined();

    await shell.shutdown();

    // After shutdown, job queue DB client should be closed.
    let threw = false;
    try {
      await jobQueueService.getStats();
    } catch (e: unknown) {
      threw = true;
      const fullError =
        String(e) + (e instanceof Error && e.cause ? String(e.cause) : "");
      expect(fullError).toContain("CLIENT_CLOSED");
    }
    expect(threw).toBe(true);
  });

  it("should close runtime state database connection on shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();

    const runtimeState = shell.getRuntimeState().scoped({
      namespace: "shutdown.test",
      schema: z.string(),
    });

    await runtimeState.set("key", "value");
    expect(await runtimeState.get("key")).toBe("value");

    await shell.shutdown();

    let threw = false;
    try {
      await runtimeState.get("key");
    } catch (e: unknown) {
      threw = true;
      const fullError =
        String(e) + (e instanceof Error && e.cause ? String(e.cause) : "");
      expect(fullError).toContain("CLIENT_CLOSED");
    }
    expect(threw).toBe(true);
  });

  it("should close databases when an earlier finalizer fails", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shutdownError = new Error("worker failed to stop");
    const shell = Shell.createFresh(config, {
      ...deps,
      jobQueueWorker: {
        start: async (): Promise<void> => {},
        stop: async (): Promise<void> => {
          throw shutdownError;
        },
        getStats: () => ({
          processedJobs: 0,
          failedJobs: 0,
          activeJobs: 0,
          uptime: 0,
          isRunning: true,
        }),
        isWorkerRunning: () => true,
      },
    });
    await shell.initialize();

    let receivedError: unknown;
    try {
      await shell.shutdown();
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBe(shutdownError);

    let queryError: unknown;
    try {
      await shell.getJobQueueService().getStats();
    } catch (error) {
      queryError = error;
    }
    const fullQueryError =
      String(queryError) +
      (queryError instanceof Error && queryError.cause
        ? String(queryError.cause)
        : "");
    expect(fullQueryError).toContain("CLIENT_CLOSED");
  });

  it("should stop background workers, then plugin daemons, before closing databases", async () => {
    const order: string[] = [];
    let workerRunningDuringDaemonStop: boolean | undefined;
    let dbUsableDuringDaemonStop = false;
    let jobDbUsableDuringDaemonStop = false;

    const daemonPlugin: Plugin = {
      id: "shutdown-order-plugin",
      version: "1.0.0",
      type: "service",
      description: "Observes shutdown ordering from its daemon stop hook",
      packageName: "@test/shutdown-order",
      register: async (shellInstance) => {
        shellInstance.registerDaemon(
          "shutdown-order-daemon",
          {
            start: async () => {
              order.push("daemon-started");
            },
            stop: async () => {
              order.push("daemon-stopped");

              const shellWithServices = shellInstance as unknown as {
                services: { jobQueueWorker: { isWorkerRunning(): boolean } };
              };
              workerRunningDuringDaemonStop =
                shellWithServices.services.jobQueueWorker.isWorkerRunning();

              // Databases must outlive daemons: shutdown closes them last.
              await shellInstance
                .getEntityService()
                .listEntities({ entityType: "note" });
              dbUsableDuringDaemonStop = true;
              await shellInstance.getJobQueueService().getStats();
              jobDbUsableDuringDaemonStop = true;
            },
          },
          "shutdown-order-plugin",
        );
        return { tools: [], resources: [] };
      },
    };

    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    config.plugins = [daemonPlugin];
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();

    await shell.shutdown();

    expect(order).toEqual(["daemon-started", "daemon-stopped"]);
    expect(workerRunningDuringDaemonStop).toBe(false);
    expect(dbUsableDuringDaemonStop).toBe(true);
    expect(jobDbUsableDuringDaemonStop).toBe(true);
  });

  it("currently shuts plugins down before active agent turns", async () => {
    const order: string[] = [];
    const plugin: Plugin = {
      id: "active-turn-order",
      version: "1.0.0",
      type: "service",
      description: "Records plugin teardown order",
      packageName: "@test/active-turn-order",
      register: async () => ({ tools: [], resources: [] }),
      shutdown: async (): Promise<void> => {
        order.push("plugin");
      },
    };

    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    config.plugins = [plugin];
    const shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });
    const agentService = shell.getAgentService();
    const shutdownAgent = agentService.shutdown?.bind(agentService);
    agentService.shutdown = async (): Promise<void> => {
      order.push("agent");
      await shutdownAgent?.();
    };

    await shell.shutdown();

    expect(order).toEqual(["plugin", "agent"]);
  });

  it("currently admits two concurrent shell boots", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    const firstInitializationStarted = deferred();
    const secondInitializationStarted = deferred();
    const releaseInitialization = deferred();
    const entityService = shell.getEntityService();
    const initializeEntityService =
      entityService.initialize.bind(entityService);
    let initializationCalls = 0;
    entityService.initialize = async (): Promise<void> => {
      initializationCalls++;
      if (initializationCalls === 1) firstInitializationStarted.resolve();
      if (initializationCalls === 2) secondInitializationStarted.resolve();
      await releaseInitialization.promise;
      await initializeEntityService();
    };

    const firstBoot = shell.initialize({ mode: "register-only" });
    await firstInitializationStarted.promise;
    const secondBoot = shell.initialize({ mode: "register-only" });
    await secondInitializationStarted.promise;
    releaseInitialization.resolve();

    const results = await Promise.allSettled([firstBoot, secondBoot]);
    expect(initializationCalls).toBe(2);
    expect(results.some((result) => result.status === "rejected")).toBe(true);
    await shell.shutdown();
  });

  it("currently lets shutdown settle while shell boot is admitted", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    const entityInitializationPaused = deferred();
    const releaseEntityInitialization = deferred();
    const entityService = shell.getEntityService();
    const initializeEntityService =
      entityService.initialize.bind(entityService);
    entityService.initialize = async (): Promise<void> => {
      await initializeEntityService();
      entityInitializationPaused.resolve();
      await releaseEntityInitialization.promise;
    };

    const booting = shell.initialize({ mode: "register-only" });
    await entityInitializationPaused.promise;
    const shuttingDown = shell.shutdown();
    await shuttingDown;

    releaseEntityInitialization.resolve();
    await booting;
    expect(shell.isInitialized()).toBe(true);
  });

  it("should allow a second shell to boot cleanly after first is shut down", async () => {
    await runMigrations(testDir.dir);
    const config1 = createTestConfig(testDir.dir);
    const shell1 = Shell.createFresh(config1, deps);
    await shell1.initialize();

    // Use the first shell's job queue
    const stats1 = await shell1.getJobQueueService().getStats();
    expect(stats1).toBeDefined();

    await shell1.shutdown();

    // Second shell with fresh DB paths — no singleton reset is needed because
    // each Shell.createFresh() owns an independent service graph.
    const testDir2 = await createTestDirectory();
    await runMigrations(testDir2.dir);
    const config2 = createTestConfig(testDir2.dir);
    const shell2 = Shell.createFresh(config2, deps);
    await shell2.initialize();

    // Second shell should work without CLIENT_CLOSED errors
    const stats2 = await shell2.getJobQueueService().getStats();
    expect(stats2).toBeDefined();

    const entities = await shell2.getEntityService().listEntities({
      entityType: "note",
    });
    expect(entities).toEqual([]);

    await shell2.shutdown();
    await testDir2.cleanup();
  });
});
