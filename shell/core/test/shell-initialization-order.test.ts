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
import { ServiceRegistry } from "@brains/service-registry";
import { MessageBus } from "@brains/messaging-service";

// Mock fastembed to avoid loading actual model in tests
const mockEmbed = mock(() => Promise.resolve([[0.1, 0.2, 0.3]]));
void mock.module("fastembed", () => ({
  EmbeddingModel: class MockEmbeddingModel {
    static async init(): Promise<MockEmbeddingModel> {
      return new this();
    }
    embed = mockEmbed;
  },
}));

/**
 * Regression test for: Job queue worker must not process jobs before system:plugins:ready
 *
 * Bug: If there are pending jobs in the database from a previous run, they could
 * execute before all entity adapters are registered, causing files to be quarantined.
 *
 * The root cause is that in Shell.initialize():
 * 1. jobQueueWorker.start() is called first
 * 2. THEN system:plugins:ready is emitted
 *
 * This means pending jobs from previous runs can execute before plugins have
 * completed their system:plugins:ready handlers (where entity adapters are often
 * set up for initial sync operations).
 *
 * Fix: Emit system:plugins:ready BEFORE starting the job queue worker.
 */
describe("Shell initialization order", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };
  let shell: Shell;
  const initOrder: string[] = [];

  beforeEach(async () => {
    testDir = await createTestDirectory();
    initOrder.length = 0; // Clear the order tracking
    // Reset all singletons to ensure test isolation
    // Order matters: reset dependents before dependencies
    await Shell.resetInstance();
    ShellInitializer.resetInstance();
    PluginManager.resetInstance();
    ServiceRegistry.resetInstance();
    MessageBus.resetInstance();
    EntityRegistry.resetInstance();
    JobQueueWorker.resetInstance();
    JobQueueService.resetInstance();
    BatchJobManager.resetInstance();
    JobProgressMonitor.resetInstance();
    DataSourceRegistry.resetInstance();
  });

  afterEach(async () => {
    await shell?.shutdown();
    await Shell.resetInstance();
    ShellInitializer.resetInstance();
    PluginManager.resetInstance();
    ServiceRegistry.resetInstance();
    MessageBus.resetInstance();
    EntityRegistry.resetInstance();
    JobQueueWorker.resetInstance();
    JobQueueService.resetInstance();
    BatchJobManager.resetInstance();
    JobProgressMonitor.resetInstance();
    DataSourceRegistry.resetInstance();
    await testDir.cleanup();
  });

  it("should complete all system:plugins:ready handlers before job processing can start", async () => {
    // Track if the ready handler has completed
    let readyHandlerCompleted = false;

    // Create a plugin that simulates work in system:plugins:ready handler
    const testPlugin: Plugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test plugin",
      packageName: "@test/plugin",
      register: async (shellInstance) => {
        // Subscribe to system:plugins:ready
        shellInstance
          .getMessageBus()
          .subscribe("system:plugins:ready", async () => {
            initOrder.push("ready-handler-started");
            // Simulate async work (like initial sync setup)
            await new Promise((resolve) => setTimeout(resolve, 50));
            readyHandlerCompleted = true;
            initOrder.push("ready-handler-completed");
            return { success: true };
          });
        return { tools: [], resources: [] };
      },
    };

    const config: ShellConfigInput = {
      plugins: [testPlugin],
      database: { url: `file:${testDir.dir}/test.db` },
      jobQueueDatabase: { url: `file:${testDir.dir}/test-jobs.db` },
      conversationDatabase: { url: `file:${testDir.dir}/test-conv.db` },
      embedding: {
        cacheDir: `${testDir.dir}/embeddings`,
        model: "fast-all-MiniLM-L6-v2",
      },
    };
    const deps: ShellDependencies = { logger: createSilentLogger() };

    shell = Shell.createFresh(config, deps);

    // Initialize the shell
    await shell.initialize();

    // After initialize() returns, the ready handler MUST have completed
    // before any job processing could have started
    expect(readyHandlerCompleted).toBe(true);
    expect(initOrder).toContain("ready-handler-started");
    expect(initOrder).toContain("ready-handler-completed");
  });

  it("should allow plugins to register entity adapters before jobs are processed", async () => {
    // This test ensures the architectural contract:
    // Entity adapters registered in onRegister() are available before any job processing

    let adapterRegistered = false;

    // Create a plugin that registers an entity adapter during onRegister
    const entityPlugin: Plugin = {
      id: "entity-plugin",
      version: "1.0.0",
      type: "service",
      description: "Entity plugin",
      packageName: "@test/entity-plugin",
      register: async () => {
        // In real plugins, entity adapters are registered here in onRegister()
        // This happens BEFORE system:plugins:ready is emitted
        adapterRegistered = true;
        initOrder.push("entity-adapter-registered-in-onRegister");
        return { tools: [], resources: [] };
      },
    };

    const config: ShellConfigInput = {
      plugins: [entityPlugin],
      database: { url: `file:${testDir.dir}/test.db` },
      jobQueueDatabase: { url: `file:${testDir.dir}/test-jobs.db` },
      conversationDatabase: { url: `file:${testDir.dir}/test-conv.db` },
      embedding: {
        cacheDir: `${testDir.dir}/embeddings`,
        model: "fast-all-MiniLM-L6-v2",
      },
    };
    const deps: ShellDependencies = { logger: createSilentLogger() };

    shell = Shell.createFresh(config, deps);

    // Initialize the shell
    await shell.initialize();

    // The adapter should be registered (this happens during plugin initialization,
    // which completes before either system:plugins:ready or job processing)
    expect(adapterRegistered).toBe(true);
    expect(initOrder).toContain("entity-adapter-registered-in-onRegister");
  });

  it("should emit system:plugins:ready BEFORE any background services start", async () => {
    // This test verifies the critical architectural requirement:
    // system:plugins:ready must be emitted BEFORE background services start.
    //
    // Background services include:
    // - Job queue worker (processes pending jobs)
    // - Job progress monitor
    //
    // BUG: Currently, Shell.initialize() starts services BEFORE emitting plugins:ready.
    // This means pending jobs from previous runs can execute before plugins are ready.
    //
    // FIX: Emit system:plugins:ready BEFORE starting any background services.

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
            // Check if background services are already running
            // If they are, that's a BUG - they should start AFTER this handler completes

            // Access the shell's internal state to check service status
            // We use type assertion since these are internal details
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

    const config: ShellConfigInput = {
      plugins: [orderCheckPlugin],
      database: { url: `file:${testDir.dir}/test.db` },
      jobQueueDatabase: { url: `file:${testDir.dir}/test-jobs.db` },
      conversationDatabase: { url: `file:${testDir.dir}/test-conv.db` },
      embedding: {
        cacheDir: `${testDir.dir}/embeddings`,
        model: "fast-all-MiniLM-L6-v2",
      },
    };
    const deps: ShellDependencies = { logger: createSilentLogger() };

    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    // THE CRITICAL ASSERTION:
    // When system:plugins:ready fires, the job queue worker should NOT be running yet.
    // With the current buggy code, this will FAIL.
    // After the fix, this will PASS.
    expect(jobQueueWorkerRunning).toBe(false);
    expect(initOrder).toContain(
      "OK:job-queue-worker-not-running-during-plugins-ready",
    );
    expect(initOrder).not.toContain(
      "BUG:job-queue-worker-running-before-plugins-ready",
    );
  });
});
