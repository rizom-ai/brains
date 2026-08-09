import { afterEach, describe, expect, it } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  type IJobQueueWorker,
  type JobHandler,
  type JobQueueWorkerStats,
} from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { MessageBus } from "@brains/messaging-service";
import { OperationContext } from "@brains/operation-context";
import {
  type Daemon,
  type Plugin,
  type PluginCapabilities,
  type ServicePluginContext,
  ServicePlugin,
  type Tool,
} from "@brains/plugins";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger } from "@brains/test-utils";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { DaemonRegistry } from "../src/daemon-registry";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";
import { createTestDirectory } from "./helpers/test-db";

class ExecutionAuditPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  public readyCalled = false;
  private readonly onProcess: () => void | Promise<void>;

  public constructor(onProcess: () => void | Promise<void> = () => undefined) {
    super(
      "execution-audit",
      { name: "@test/execution-audit", version: "1.0.0" },
      {},
      z.object({}),
    );
    this.onProcess = onProcess;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.messaging.subscribe("test:ordinary-ingress", async () => ({
      success: true,
    }));
    context.messaging.subscribeExecution(
      "test:execution-dependency",
      async () => ({ success: true }),
    );
  }

  protected override async registerJobHandlers(
    context: ServicePluginContext,
  ): Promise<void> {
    const handler: JobHandler<"execution-audit:execute", { value: string }> = {
      validateAndParse: (data) => {
        const parsed = z.object({ value: z.string() }).safeParse(data);
        return parsed.success ? parsed.data : null;
      },
      process: async (
        _data: { value: string },
        _jobId: string,
        _progress: ProgressReporter,
        _signal: AbortSignal,
      ): Promise<void> => this.onProcess(),
    };
    context.jobs.registerHandler("execute", handler);
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      {
        name: "execution_audit_tool",
        description: "Must not be exposed by the worker process",
        inputSchema: {},
        handler: async () => ({ success: true, data: {} }),
      },
    ];
  }

  protected override async onReady(): Promise<void> {
    this.readyCalled = true;
  }
}

function createInterfacePlugin(onRegister: () => void): Plugin {
  return {
    id: "execution-audit-interface",
    packageName: "@test/execution-audit-interface",
    version: "1.0.0",
    type: "interface",
    register: async (shell): Promise<PluginCapabilities> => {
      onRegister();
      const daemon: Daemon = {
        start: async (): Promise<void> => {},
        stop: async (): Promise<void> => {},
      };
      shell.registerDaemon("execution-audit-interface", daemon, "interface");
      return { tools: [], resources: [] };
    },
  };
}

function createTrackingWorker(onStart: () => void): IJobQueueWorker {
  return {
    start: async (): Promise<void> => {
      onStart();
    },
    stop: async (): Promise<void> => {},
    getStats: (): JobQueueWorkerStats => ({
      processedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
      uptime: 0,
      isRunning: false,
      isHealthy: true,
    }),
    isWorkerRunning: (): boolean => false,
  };
}

describe("supervised runtime process roles", () => {
  const shells: Shell[] = [];
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const shell of shells.splice(0).reverse()) await shell.shutdown();
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  it("reaches web readiness without starting a queue worker", async () => {
    const testDirectory = await createTestDirectory();
    cleanups.push(testDirectory.cleanup);
    await Promise.all([
      migrateEntities({ url: `file:${testDirectory.dir}/test.db` }),
      migrateJobQueue({ url: `file:${testDirectory.dir}/test-jobs.db` }),
      migrateConversations({ url: `file:${testDirectory.dir}/test-conv.db` }),
      migrateRuntimeState({
        url: `file:${testDirectory.dir}/test-runtime-state.db`,
      }),
    ]);

    const executionPlugin = new ExecutionAuditPlugin();
    let workerStarted = false;
    const shell = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        plugins: [executionPlugin],
      }),
      {
        logger: createSilentLogger("web-process-role-test"),
        jobQueueWorker: createTrackingWorker(() => {
          workerStarted = true;
        }),
      },
      { processRole: "web" },
    );
    shells.push(shell);

    await shell.initialize();

    expect(shell.isInitialized()).toBe(true);
    expect(workerStarted).toBe(false);
    expect(
      shell.getJobQueueService().getHandler("execution-audit:execute"),
    ).toBeUndefined();
    expect(
      shell.getJobQueueService().getExecutionRegistrations(),
    ).toContainEqual({
      type: "execution-audit:execute",
      pluginId: "execution-audit",
    });
    const jobId = await shell.getJobQueueService().enqueue({
      type: "execution-audit:execute",
      data: { value: "queued-by-web" },
      options: {
        source: "test",
        metadata: { operationType: "data_processing" },
      },
    });
    expect(jobId).toBeString();
  });

  it("routes worker queue persistence through the web owner endpoint", async () => {
    const testDirectory = await createTestDirectory();
    cleanups.push(testDirectory.cleanup);
    await Promise.all([
      migrateEntities({ url: `file:${testDirectory.dir}/test.db` }),
      migrateJobQueue({ url: `file:${testDirectory.dir}/test-jobs.db` }),
      migrateConversations({ url: `file:${testDirectory.dir}/test-conv.db` }),
      migrateRuntimeState({
        url: `file:${testDirectory.dir}/test-runtime-state.db`,
      }),
    ]);

    const endpoint = {
      address: `${testDirectory.dir}/database-owner.sock`,
      secret: "s".repeat(48),
    };
    const web = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        plugins: [new ExecutionAuditPlugin()],
      }),
      { logger: createSilentLogger("database-owner-web-test") },
      {
        processRole: "web",
        localDatabaseEndpoint: { ...endpoint, sessionId: "web-session" },
      },
    );
    const workerOperationContext = OperationContext.createFresh();
    let acknowledgeProcessed = (): void => undefined;
    const processed = new Promise<void>((resolve) => {
      acknowledgeProcessed = resolve;
    });
    const worker = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        plugins: [new ExecutionAuditPlugin(acknowledgeProcessed)],
      }),
      {
        logger: createSilentLogger("database-owner-worker-test"),
        operationContext: workerOperationContext,
      },
      {
        processRole: "worker",
        localDatabaseEndpoint: { ...endpoint, sessionId: "worker-session" },
      },
    );
    shells.push(web, worker);

    await web.initialize({ mode: "startup-check" });
    await worker.initialize();

    const jobId = await workerOperationContext.run(
      {
        rootJobId: "remote-root",
        causationId: "initial-cause",
        projectionLineage: [],
        derivationDepth: 0,
      },
      "worker-operation",
      () =>
        worker.getJobQueueService().enqueue({
          type: "execution-audit:execute",
          data: { value: "queued-by-worker" },
          options: {
            priority: -100,
            source: "test",
            rootJobId: "remote-root",
            metadata: { operationType: "data_processing" },
          },
        }),
    );
    await processed;
    await worker.shutdown();

    expect(await web.getJobQueueService().getStatus(jobId)).toMatchObject({
      status: "completed",
      metadata: {
        provenance: {
          rootJobId: "remote-root",
          causationId: "worker-operation",
        },
      },
    });
  });

  it("boots only immutable execution capabilities in the worker", async () => {
    const testDirectory = await createTestDirectory();
    cleanups.push(testDirectory.cleanup);
    await Promise.all([
      migrateEntities({ url: `file:${testDirectory.dir}/test.db` }),
      migrateJobQueue({ url: `file:${testDirectory.dir}/test-jobs.db` }),
      migrateConversations({ url: `file:${testDirectory.dir}/test-conv.db` }),
      migrateRuntimeState({
        url: `file:${testDirectory.dir}/test-runtime-state.db`,
      }),
    ]);

    const logger = createSilentLogger("runtime-process-role-test");
    const messageBus = MessageBus.createFresh(logger);
    const daemonRegistry = DaemonRegistry.createFresh(logger);
    const executionPlugin = new ExecutionAuditPlugin();
    let interfaceRegistered = false;
    let workerStarted = false;
    const config = createTestShellConfig(testDirectory.dir, {
      plugins: [
        executionPlugin,
        createInterfacePlugin(() => {
          interfaceRegistered = true;
        }),
      ],
    });
    const shell = Shell.createFresh(
      config,
      {
        logger,
        messageBus,
        daemonRegistry,
        jobQueueWorker: createTrackingWorker(() => {
          workerStarted = true;
        }),
      },
      { processRole: "worker" },
    );
    shells.push(shell);

    await shell.initialize();

    const registrations = shell
      .getJobQueueService()
      .getExecutionRegistrations();
    expect(registrations).toContainEqual({
      type: "execution-audit:execute",
      pluginId: "execution-audit",
    });
    expect(
      shell.getJobQueueService().getHandler("execution-audit:execute"),
    ).toBeDefined();
    expect(messageBus.getHandlerCount("test:ordinary-ingress")).toBe(0);
    expect(messageBus.getHandlerCount("test:execution-dependency")).toBe(1);
    expect(shell.getMCPService().listTools()).toEqual([]);
    expect(daemonRegistry.getAll()).toEqual([]);
    expect(interfaceRegistered).toBe(false);
    expect(executionPlugin.readyCalled).toBe(false);
    expect(workerStarted).toBe(true);
  });
});
