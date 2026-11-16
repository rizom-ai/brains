import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestShellConfig } from "./helpers/test-config";
import { Shell, type ShellDependencies } from "../src/shell";
import type {
  Plugin,
  PluginCapabilities,
  WebRouteDefinition,
} from "@brains/plugins";
import { baseEntitySchema } from "@brains/entity-service";
import {
  createTestEntity,
  createTestEntityAdapter,
} from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "@brains/test-utils";
import {
  openOfflineEntityDatabase,
  readDatabaseLeases,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { z } from "@brains/utils/zod";

async function runMigrations(dir: string): Promise<void> {
  await migrateEntities({ url: `file:${dir}/test.db` });
  await migrateJobQueue({ url: `file:${dir}/test-jobs.db` });
  await migrateConversations({ url: `file:${dir}/test-conv.db` });
  await migrateRuntimeState({ url: `file:${dir}/test-runtime-state.db` });
}

const mockEmbeddingService = {
  identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
  embedQuery: async (): Promise<{
    embedding: Float32Array;
    usage: { tokens: number };
  }> => ({
    embedding: new Float32Array(1536).fill(0.1),
    usage: { tokens: 10 },
  }),
  embedDocuments: async (
    texts: { content: string }[],
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

function freePort(): number {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
}

/**
 * Holds what MCP and A2A hold open: an event stream that never ends and a
 * request whose body never finishes. Each keeps its own daemon, as those
 * transports do, so the test sees their stops still run after the host
 * closes the requests.
 */
function streamHoldingPlugin(
  stopped: string[],
  entered: { stream(): void; body(): void },
): Plugin {
  return {
    id: "stream-holder",
    packageName: "@test/stream-holder",
    type: "service",
    version: "1.0.0",
    register: async (shell): Promise<PluginCapabilities> => {
      for (const name of ["mcp-like", "a2a-like"]) {
        shell.registerDaemon(
          name,
          {
            start: async (): Promise<void> => undefined,
            stop: async (): Promise<void> => {
              stopped.push(name);
            },
          },
          "stream-holder",
        );
      }
      return { tools: [], resources: [] };
    },
    getWebRoutes: (): WebRouteDefinition[] => [
      {
        path: "/stream",
        public: true,
        handler: (): Response => {
          entered.stream();
          // Opens the event stream, as an SSE transport does, and never ends it.
          const opened = new ReadableStream<Uint8Array>({
            start: (controller): void => {
              controller.enqueue(new TextEncoder().encode(": open\n\n"));
            },
          });
          return new Response(opened, {
            headers: { "Content-Type": "text/event-stream" },
          });
        },
      },
      {
        path: "/body",
        method: "POST",
        public: true,
        handler: async (request): Promise<Response> => {
          entered.body();
          // The forced close aborts the body read.
          return new Response(await request.text().catch(() => ""));
        },
      },
    ],
  };
}

describe("Shell shutdown", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };

  beforeEach(async (): Promise<void> => {
    testDir = await createTestDirectory();
  });

  afterEach(async (): Promise<void> => {
    await testDir.cleanup();
  });

  it("should close entity database connection on shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestShellConfig(testDir.dir);
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

  it("releases the entity database lease on a clean shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestShellConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();
    const reader = openOfflineEntityDatabase(`${testDir.dir}/test.db`).client;
    try {
      expect(await readDatabaseLeases(reader)).toHaveLength(1);

      await shell.shutdown();

      expect(await readDatabaseLeases(reader)).toEqual([]);
    } finally {
      reader.close();
    }
  });

  it(
    "finishes the whole shutdown while requests are held open",
    async () => {
      await runMigrations(testDir.dir);
      const port = freePort();
      const stopped: string[] = [];
      const stream = Promise.withResolvers<void>();
      const body = Promise.withResolvers<void>();
      const config = createTestShellConfig(testDir.dir, {
        http: { enabled: true, hostname: "127.0.0.1", port },
        plugins: [
          streamHoldingPlugin(stopped, {
            stream: () => stream.resolve(),
            body: () => body.resolve(),
          }),
        ],
      });
      const shell = Shell.createFresh(config, deps, { processRole: "web" });
      shell
        .getEntityRegistry()
        .registerEntityType(
          "picture",
          baseEntitySchema,
          createTestEntityAdapter("picture"),
          {
            binaryStorage: "asset",
            embeddable: false,
            fullTextSearchable: false,
          },
        );
      await shell.initialize();
      const entityService = shell.getEntityService();
      const asset = await entityService.stageAsset(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
      );
      await entityService.createEntity({
        entity: createTestEntity("picture", {
          id: "cover",
          content: asset.ref,
          metadata: { mediaType: "image/png" },
        }),
        stagedAsset: asset,
      });
      // A legacy read the ledger holds until its final flush.
      await entityService.getEntityRaw({ entityType: "picture", id: "cover" });

      const openStream = await fetch(`http://127.0.0.1:${port}/stream`);
      const events = openStream.body?.getReader();
      await events?.read();
      const streamEnded = events?.read().then(
        ({ done }) => (done ? "ended" : "data"),
        () => "ended",
      );
      const partial = Bun.connect({
        hostname: "127.0.0.1",
        port,
        socket: { data: () => undefined },
      });
      (await partial).write(
        "POST /body HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 1000\r\n\r\npartial",
      );
      await Promise.all([stream.promise, body.promise]);

      const started = performance.now();
      await shell.shutdown();

      // The host's default drain deadline, with room for the rest of shutdown.
      expect(performance.now() - started).toBeLessThan(8_000);
      expect(await streamEnded).toBe("ended");
      expect(stopped.sort()).toEqual(["a2a-like", "mcp-like"]);
      const reader = openOfflineEntityDatabase(`${testDir.dir}/test.db`).client;
      try {
        expect(await readDatabaseLeases(reader)).toEqual([]);
      } finally {
        reader.close();
      }
      let closedError: unknown;
      try {
        await entityService.listEntities({ entityType: "note" });
      } catch (error) {
        closedError = error;
      }
      expect(
        String(closedError) +
          (closedError instanceof Error ? String(closedError.cause) : ""),
      ).toContain("CLIENT_CLOSED");

      const next = Shell.createFresh(createTestShellConfig(testDir.dir), deps, {
        processRole: "web",
      });
      await next.initialize();
      try {
        expect(
          (await next.getAppInfo()).legacyBinaryContent.map(
            ({ method, count }) => [method, count],
          ),
        ).toEqual([["getEntityRaw", 1]]);
      } finally {
        await next.shutdown();
      }
    },
    { timeout: 20_000 },
  );

  it("should close job queue database connection on shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestShellConfig(testDir.dir);
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
    const config = createTestShellConfig(testDir.dir);
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
    const config = createTestShellConfig(testDir.dir);
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
          isHealthy: true,
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

              workerRunningDuringDaemonStop = shell.isJobQueueWorkerRunning();

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
    const config = createTestShellConfig(testDir.dir);
    config.plugins = [daemonPlugin];
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();

    await shell.shutdown();

    expect(order).toEqual(["daemon-started", "daemon-stopped"]);
    expect(workerRunningDuringDaemonStop).toBe(false);
    expect(dbUsableDuringDaemonStop).toBe(true);
    expect(jobDbUsableDuringDaemonStop).toBe(true);
  });

  it("stops active agent turns before shutting plugins down", async () => {
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
    const config = createTestShellConfig(testDir.dir);
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

    expect(order).toEqual(["agent", "plugin"]);
  });

  it("makes concurrent shell initialization callers join one boot", async () => {
    await runMigrations(testDir.dir);
    const config = createTestShellConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    const initializationStarted = deferred();
    const releaseInitialization = deferred();
    const entityService = shell.getEntityService();
    const initializeEntityService =
      entityService.initialize.bind(entityService);
    let initializationCalls = 0;
    entityService.initialize = async (): Promise<void> => {
      initializationCalls++;
      initializationStarted.resolve();
      await releaseInitialization.promise;
      await initializeEntityService();
    };

    const firstBoot = shell.initialize({ mode: "register-only" });
    await initializationStarted.promise;
    const secondBoot = shell.initialize({ mode: "register-only" });
    releaseInitialization.resolve();

    await Promise.all([firstBoot, secondBoot]);
    expect(initializationCalls).toBe(1);
    expect(shell.isInitialized()).toBe(true);
    await shell.shutdown();
  });

  it("rejects a conflicting mode while shell boot is admitted", async () => {
    await runMigrations(testDir.dir);
    const config = createTestShellConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    const initializationStarted = deferred();
    const releaseInitialization = deferred();
    const entityService = shell.getEntityService();
    const initializeEntityService =
      entityService.initialize.bind(entityService);
    entityService.initialize = async (): Promise<void> => {
      initializationStarted.resolve();
      await releaseInitialization.promise;
      await initializeEntityService();
    };

    const booting = shell.initialize({ mode: "register-only" });
    await initializationStarted.promise;
    let conflictError: unknown;
    try {
      await shell.initialize({ mode: "startup-check" });
    } catch (error) {
      conflictError = error;
    }

    expect(conflictError).toEqual(
      new Error(
        "Shell is already initializing in register-only mode; cannot join startup-check mode",
      ),
    );
    releaseInitialization.resolve();
    await booting;
    await shell.shutdown();
  });

  it("waits for admitted shell boot before shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestShellConfig(testDir.dir);
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
    let shutdownSettled = false;
    const shuttingDown = shell.shutdown().then(() => {
      shutdownSettled = true;
    });
    await Promise.resolve();
    expect(shutdownSettled).toBe(false);

    releaseEntityInitialization.resolve();
    await Promise.all([booting, shuttingDown]);
    expect(shell.isInitialized()).toBe(false);
  });

  it("releases the lease when shutdown arrives during a normal boot", async () => {
    await runMigrations(testDir.dir);
    const shell = Shell.createFresh(createTestShellConfig(testDir.dir), deps);
    const leaseTaken = deferred();
    const releaseBoot = deferred();
    const entityService = shell.getEntityService();
    const initializeEntityService =
      entityService.initialize.bind(entityService);
    entityService.initialize = async (): Promise<void> => {
      await initializeEntityService();
      leaseTaken.resolve();
      await releaseBoot.promise;
    };
    const reader = openOfflineEntityDatabase(`${testDir.dir}/test.db`).client;
    try {
      const booting = shell.initialize();
      await leaseTaken.promise;
      expect(await readDatabaseLeases(reader)).toHaveLength(1);

      const shuttingDown = shell.shutdown();
      releaseBoot.resolve();
      await Promise.all([booting, shuttingDown]);

      expect(await readDatabaseLeases(reader)).toEqual([]);
      expect(shell.isInitialized()).toBe(false);
    } finally {
      reader.close();
    }
  });

  for (const processRole of ["web", "worker"] as const) {
    it(`shuts down a ${processRole} shell that never booted`, async () => {
      await runMigrations(testDir.dir);
      const config = createTestShellConfig(testDir.dir, {
        http: { enabled: true, hostname: "127.0.0.1", port: freePort() },
      });
      const shell = Shell.createFresh(config, deps, { processRole });

      expect(await shell.shutdown()).toBeUndefined();
      const refused = await shell.initialize().then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(Error);
      expect(String(refused)).toContain("closing shell");
    });
  }

  it("should allow a second shell to boot cleanly after first is shut down", async () => {
    await runMigrations(testDir.dir);
    const config1 = createTestShellConfig(testDir.dir);
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
    const config2 = createTestShellConfig(testDir2.dir);
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
