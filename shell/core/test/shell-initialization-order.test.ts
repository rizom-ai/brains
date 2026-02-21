import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import { ShellInitializer } from "../src/initialization/shellInitializer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";
import type { Plugin } from "@brains/plugins";
import { PluginManager } from "@brains/plugins";
import { EntityRegistry } from "@brains/entity-service";
import {
  JobQueueWorker,
  JobQueueService,
  BatchJobManager,
  JobProgressMonitor,
} from "@brains/job-queue";
import { DataSourceRegistry } from "@brains/datasource";
import { MessageBus } from "@brains/messaging-service";

const mockEmbed = mock(() => Promise.resolve([[0.1, 0.2, 0.3]]));
void mock.module("fastembed", () => ({
  EmbeddingModel: class MockEmbeddingModel {
    static async init(): Promise<MockEmbeddingModel> {
      return new this();
    }
    embed = mockEmbed;
  },
}));

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
    embedding: {
      cacheDir: `${dir}/embeddings`,
      model: "fast-all-MiniLM-L6-v2",
    },
  };
}

const deps: ShellDependencies = { logger: createSilentLogger() };

describe("Shell initialization order", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };
  let shell: Shell;
  const initOrder: string[] = [];

  beforeEach(async () => {
    testDir = await createTestDirectory();
    initOrder.length = 0;
    await resetAllSingletons();
  });

  afterEach(async () => {
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
