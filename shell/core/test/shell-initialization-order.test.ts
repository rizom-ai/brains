import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestShellConfig } from "./helpers/test-config";
import { Shell, type ShellDependencies } from "../src/shell";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { createTestDirectory } from "@brains/test-utils";
import { deferred } from "@brains/utils/deferred";
import type { Daemon, Plugin } from "@brains/plugins";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";

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
    await migrateEntities({
      url: `file:${testDir.dir}/test.db`,
    });
    await migrateJobQueue({ url: `file:${testDir.dir}/test-jobs.db` });
    await migrateRuntimeState({
      url: `file:${testDir.dir}/test-runtime-state.db`,
    });
    initOrder.length = 0;
  });

  afterEach(async (): Promise<void> => {
    await shell.shutdown();
    await testDir.cleanup();
  });

  it("should start webserver before plugins-registered initial sync handlers complete", async () => {
    const order: string[] = [];
    const finishInitialSync = deferred();

    const webserverPlugin: Plugin = {
      id: "webserver-plugin",
      version: "1.0.0",
      type: "service",
      description: "Registers the shared webserver daemon",
      packageName: "@test/webserver-plugin",
      register: async (shellInstance) => {
        shellInstance.registerDaemon(
          "webserver:webserver",
          {
            start: async () => {
              order.push("webserver-started");
            },
            stop: async () => {
              order.push("webserver-stopped");
            },
          },
          "webserver",
        );
        return { tools: [], resources: [] };
      },
    };

    const directorySyncLikePlugin: Plugin = {
      id: "directory-sync-like-plugin",
      version: "1.0.0",
      type: "service",
      description: "Simulates slow initial sync",
      packageName: "@test/directory-sync-like-plugin",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
            order.push("initial-sync-started");
            await finishInitialSync.promise;
            order.push("initial-sync-completed");
            return { success: true };
          });
        return { tools: [], resources: [] };
      },
    };

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [webserverPlugin, directorySyncLikePlugin];
    shell = Shell.createFresh(config, deps);
    // Held open rather than made slow with a 50ms sleep. The claim in the name
    // is that the webserver is up *before the sync handler completes*, and
    // holding the handler is what lets that be asserted while it is still
    // running — the sleep only allowed a comparison of the two start indices,
    // which is a weaker statement than the test's own title.
    const initializing = shell.initialize();
    await waitUntil(
      () => order.includes("initial-sync-started"),
      "the initial sync handler to start",
    );

    expect(order).toContain("webserver-started");
    expect(order).not.toContain("initial-sync-completed");

    finishInitialSync.resolve();
    await initializing;

    expect(order).toContain("initial-sync-completed");
    expect(order).not.toContain("webserver-stopped");
  });

  it("should complete plugins-registered handlers before job processing can start", async () => {
    let pluginsRegisteredHandlerCompleted = false;
    const finishReadyHandler = deferred();

    const testPlugin: Plugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test plugin",
      packageName: "@test/plugin",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
            initOrder.push("ready-handler-started");
            await finishReadyHandler.promise;
            pluginsRegisteredHandlerCompleted = true;
            initOrder.push("ready-handler-completed");
            return { success: true };
          });
        return { tools: [], resources: [] };
      },
    };

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [testPlugin];
    shell = Shell.createFresh(config, deps);
    const initializing = shell.initialize();

    // The handler is held rather than slow, so "initialize did not return
    // early" is checked against the handler still running rather than against
    // a 50ms head start.
    await waitUntil(
      () => initOrder.includes("ready-handler-started"),
      "the plugins-registered handler to start",
    );
    expect(pluginsRegisteredHandlerCompleted).toBe(false);

    finishReadyHandler.resolve();
    await initializing;

    expect(pluginsRegisteredHandlerCompleted).toBe(true);
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

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [entityPlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    expect(adapterRegistered).toBe(true);
    expect(initOrder).toContain("entity-adapter-registered-in-onRegister");
  });

  it("should call ready hooks after plugins-registered signal and before daemon startup", async () => {
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
          .subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
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

    const config = createTestShellConfig(testDir.dir);
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

  it("should complete initial-sync-completed handlers before ready hooks", async () => {
    const finishSyncHandler = deferred();
    const lifecyclePlugin: Plugin = {
      id: "sync-barrier-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks initial sync barrier ordering",
      packageName: "@test/sync-barrier",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.initialSyncCompleted, async () => {
            initOrder.push("sync-completed-handler-started");
            await finishSyncHandler.promise;
            initOrder.push("sync-completed-handler-completed");
            return { success: true };
          });
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
            initOrder.push("plugins-ready");
            await shellInstance.getMessageBus().send({
              type: SYSTEM_CHANNELS.initialSyncCompleted,
              payload: { success: true },
              sender: "test",
              broadcast: true,
            });
            return { success: true };
          });
        return { tools: [], resources: [] };
      },
      ready: async () => {
        initOrder.push("ready");
      },
    };

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [lifecyclePlugin];
    shell = Shell.createFresh(config, deps);
    const initializing = shell.initialize();

    // The barrier is the point: while this handler is held, `ready` must not
    // have run. A 20ms sleep left that to timing; holding it states it.
    await waitUntil(
      () => initOrder.includes("sync-completed-handler-started"),
      "the initial-sync-completed handler to start",
    );
    expect(initOrder).not.toContain("ready");

    finishSyncHandler.resolve();
    await initializing;

    expect(initOrder.indexOf("plugins-ready")).toBeLessThan(
      initOrder.indexOf("sync-completed-handler-started"),
    );
    expect(initOrder.indexOf("sync-completed-handler-completed")).toBeLessThan(
      initOrder.indexOf("ready"),
    );
  });

  it("should emit shell-ready only after ready hooks and guarded APIs are available", async () => {
    const lifecyclePlugin: Plugin = {
      id: "shell-ready-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks shell-ready ordering",
      packageName: "@test/shell-ready",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe("system:shell:ready", async () => {
            initOrder.push(
              shell.isInitialized()
                ? "shell-ready-initialized"
                : "shell-ready-uninitialized",
            );
            return { success: true };
          });
        return { tools: [], resources: [] };
      },
      ready: async () => {
        initOrder.push("ready");
      },
    };

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [lifecyclePlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();

    expect(initOrder).toContain("shell-ready-initialized");
    expect(initOrder).not.toContain("shell-ready-uninitialized");
    expect(initOrder.indexOf("ready")).toBeLessThan(
      initOrder.indexOf("shell-ready-initialized"),
    );
  });

  it("should run ready hooks without signals, daemons, or jobs in startup-check mode", async () => {
    const daemon: Daemon = {
      start: async () => {
        initOrder.push("daemon-started");
      },
      stop: async () => {
        initOrder.push("daemon-stopped");
      },
    };

    const lifecyclePlugin: Plugin = {
      id: "startup-check-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks startup-check lifecycle",
      packageName: "@test/startup-check",
      register: async (shellInstance) => {
        initOrder.push("register");
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
            initOrder.push("plugins-ready");
            return { success: true };
          });
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.shellReady, async () => {
            initOrder.push("shell-ready");
            return { success: true };
          });
        shellInstance.registerDaemon(
          "startup-check-daemon",
          daemon,
          "startup-check-plugin",
        );
        return { tools: [], resources: [] };
      },
      ready: async () => {
        initOrder.push("ready");
      },
    };

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [lifecyclePlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "startup-check" });

    expect(initOrder).toContain("register");
    expect(initOrder).toContain("ready");
    expect(initOrder).not.toContain("plugins-ready");
    expect(initOrder).not.toContain("shell-ready");
    expect(initOrder).not.toContain("daemon-started");

    expect(shell.isJobQueueWorkerRunning()).toBe(false);
  });

  it("should not call ready hooks in register-only mode", async () => {
    const lifecyclePlugin: Plugin = {
      id: "register-only-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks register-only lifecycle",
      packageName: "@test/register-only",
      register: async () => {
        initOrder.push("register");
        return { tools: [], resources: [] };
      },
      ready: async () => {
        initOrder.push("ready");
      },
    };

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [lifecyclePlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });

    expect(initOrder).toContain("register");
    expect(initOrder).not.toContain("ready");
  });

  it("should emit plugins-registered signal before background services start", async () => {
    let jobQueueWorkerRunning = false;

    const orderCheckPlugin: Plugin = {
      id: "order-check-plugin",
      version: "1.0.0",
      type: "service",
      description: "Checks service state when plugins-registered signal fires",
      packageName: "@test/order-check",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
            // Read through the accessor. This previously reached for a
            // top-level jobQueueWorker that does not exist, so the flag was
            // always false and the guard below could never fire.
            jobQueueWorkerRunning = shell.isJobQueueWorkerRunning();

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

    const config = createTestShellConfig(testDir.dir);
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
