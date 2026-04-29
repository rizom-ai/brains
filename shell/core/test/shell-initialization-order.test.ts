import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import { ShellInitializer } from "../src/initialization/shellInitializer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";
import type { Daemon, Plugin } from "@brains/plugins";
import { PluginManager } from "@brains/plugins";
import { EntityRegistry } from "@brains/entity-service";
import {
  JobQueueWorker,
  JobQueueService,
  BatchJobManager,
  JobProgressMonitor,
} from "@brains/job-queue";
import { DataSourceRegistry } from "@brains/entity-service";
import { MessageBus } from "@brains/messaging-service";

async function resetAllSingletons(): Promise<void> {
  await Shell.resetInstance();
  ShellInitializer.resetInstance();
  PluginManager.resetInstance();
  MessageBus.resetInstance();
  EntityRegistry.resetInstance();
  JobQueueWorker.resetInstance();
  JobQueueService.resetInstance();
  BatchJobManager.resetInstance();
  JobProgressMonitor.resetInstance();
  DataSourceRegistry.resetInstance();
}

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/test-jobs.db` },
    conversationDatabase: { url: `file:${dir}/test-conv.db` },
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

describe("Shell initialization order", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };
  let shell: Shell;
  const initOrder: string[] = [];

  beforeEach(async (): Promise<void> => {
    testDir = await createTestDirectory();
    initOrder.length = 0;
    await resetAllSingletons();
  });

  afterEach(async (): Promise<void> => {
    await shell.shutdown();
    await resetAllSingletons();
    await testDir.cleanup();
  });

  it("should complete all system:plugins:ready handlers before job processing can start", async () => {
    let readyHandlerCompleted = false;

    const testPlugin: Plugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test plugin",
      packageName: "@test/plugin",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe("system:plugins:ready", async () => {
            initOrder.push("ready-handler-started");
            await new Promise((resolve) => setTimeout(resolve, 50));
            readyHandlerCompleted = true;
            initOrder.push("ready-handler-completed");
            return { success: true };
          });
        return { tools: [], resources: [] };
      },
    };

    const config = createTestConfig(testDir.dir);
    config.plugins = [testPlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    expect(readyHandlerCompleted).toBe(true);
    expect(initOrder).toContain("ready-handler-started");
    expect(initOrder).toContain("ready-handler-completed");
  });

  it("should allow plugins to register entity adapters before jobs are processed", async () => {
    let adapterRegistered = false;

    const entityPlugin: Plugin = {
      id: "entity-plugin",
      version: "1.0.0",
      type: "service",
      description: "Entity plugin",
      packageName: "@test/entity-plugin",
      register: async () => {
        adapterRegistered = true;
        initOrder.push("entity-adapter-registered-in-onRegister");
        return { tools: [], resources: [] };
      },
    };

    const config = createTestConfig(testDir.dir);
    config.plugins = [entityPlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    expect(adapterRegistered).toBe(true);
    expect(initOrder).toContain("entity-adapter-registered-in-onRegister");
  });

  it("should call ready hooks after system:plugins:ready and before daemon startup", async () => {
    const daemon: Daemon = {
      start: async () => {
        initOrder.push("daemon-started");
      },
      stop: async () => {
        initOrder.push("daemon-stopped");
      },
    };

    const lifecyclePlugin: Plugin = {
      id: "lifecycle-plugin",
      version: "1.0.0",
      type: "interface",
      description: "Checks lifecycle ordering",
      packageName: "@test/lifecycle",
      register: async (shellInstance) => {
        initOrder.push("register");
        shellInstance
          .getMessageBus()
          .subscribe("system:plugins:ready", async () => {
            initOrder.push("plugins-ready");
            return { success: true };
          });
        shellInstance.registerDaemon(
          "lifecycle-daemon",
          daemon,
          "lifecycle-plugin",
        );
        return { tools: [], resources: [] };
      },
      ready: async () => {
        initOrder.push("ready");
      },
    };

    const config = createTestConfig(testDir.dir);
    config.plugins = [lifecyclePlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    expect(initOrder.indexOf("register")).toBeLessThan(
      initOrder.indexOf("plugins-ready"),
    );
    expect(initOrder.indexOf("plugins-ready")).toBeLessThan(
      initOrder.indexOf("ready"),
    );
    expect(initOrder.indexOf("ready")).toBeLessThan(
      initOrder.indexOf("daemon-started"),
    );
  });

  it("should complete sync:initial:completed handlers before ready hooks", async () => {
    const lifecyclePlugin: Plugin = {
      id: "sync-barrier-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks initial sync barrier ordering",
      packageName: "@test/sync-barrier",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe("sync:initial:completed", async () => {
            initOrder.push("sync-completed-handler-started");
            await new Promise((resolve) => setTimeout(resolve, 20));
            initOrder.push("sync-completed-handler-completed");
            return { success: true };
          });
        shellInstance
          .getMessageBus()
          .subscribe("system:plugins:ready", async () => {
            initOrder.push("plugins-ready");
            await shellInstance
              .getMessageBus()
              .send(
                "sync:initial:completed",
                { success: true },
                "test",
                undefined,
                undefined,
                true,
              );
            return { success: true };
          });
        return { tools: [], resources: [] };
      },
      ready: async () => {
        initOrder.push("ready");
      },
    };

    const config = createTestConfig(testDir.dir);
    config.plugins = [lifecyclePlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    expect(initOrder.indexOf("plugins-ready")).toBeLessThan(
      initOrder.indexOf("sync-completed-handler-started"),
    );
    expect(initOrder.indexOf("sync-completed-handler-completed")).toBeLessThan(
      initOrder.indexOf("ready"),
    );
  });

  it("should not call ready hooks in registerOnly mode", async () => {
    const lifecyclePlugin: Plugin = {
      id: "register-only-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks registerOnly lifecycle",
      packageName: "@test/register-only",
      register: async () => {
        initOrder.push("register");
        return { tools: [], resources: [] };
      },
      ready: async () => {
        initOrder.push("ready");
      },
    };

    const config = createTestConfig(testDir.dir);
    config.plugins = [lifecyclePlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ registerOnly: true });

    expect(initOrder).toContain("register");
    expect(initOrder).not.toContain("ready");
  });

  it("should emit system:plugins:ready BEFORE any background services start", async () => {
    let jobQueueWorkerRunning = false;

    const orderCheckPlugin: Plugin = {
      id: "order-check-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks service state when plugins:ready fires",
      packageName: "@test/order-check",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe("system:plugins:ready", async () => {
            const shellAny = shellInstance as unknown as {
              jobQueueWorker?: { isWorkerRunning(): boolean };
            };

            jobQueueWorkerRunning =
              shellAny.jobQueueWorker?.isWorkerRunning() ?? false;

            if (jobQueueWorkerRunning) {
              initOrder.push(
                "BUG:job-queue-worker-running-before-plugins-ready",
              );
            } else {
              initOrder.push(
                "OK:job-queue-worker-not-running-during-plugins-ready",
              );
            }

            return { success: true };
          });
        return { tools: [], resources: [] };
      },
    };

    const config = createTestConfig(testDir.dir);
    config.plugins = [orderCheckPlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    expect(jobQueueWorkerRunning).toBe(false);
    expect(initOrder).toContain(
      "OK:job-queue-worker-not-running-during-plugins-ready",
    );
    expect(initOrder).not.toContain(
      "BUG:job-queue-worker-running-before-plugins-ready",
    );
  });
});
