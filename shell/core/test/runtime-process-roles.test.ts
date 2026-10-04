import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  type IJobQueueWorker,
  type JobHandler,
  type JobQueueWorkerStats,
} from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { MessageBus } from "@brains/messaging-service";
import {
  type Daemon,
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
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
import { createTestDirectory } from "@brains/test-utils";

class ExecutionAuditPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  public readyCalled = false;

  public constructor() {
    super(
      "execution-audit",
      { name: "@test/execution-audit", version: "1.0.0" },
      {},
      z.object({}),
    );
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
      ): Promise<void> => {},
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

/** An interface that owns a channel, and also listens and serves. */
class ChannelInterface extends MessageInterfacePlugin<
  Record<string, never>,
  Record<string, never>
> {
  public registered = false;

  public constructor() {
    super(
      "channel-interface",
      { name: "@test/channel-interface", version: "1.0.0" },
      {},
      z.object({}),
    );
  }

  protected override createDaemon(): Daemon {
    return {
      start: async (): Promise<void> => {},
      stop: async (): Promise<void> => {},
    };
  }

  protected override registerChannels(
    context: MessageInterfacePluginContext,
  ): void {
    context.channels.registerDescriptor({
      type: "test-channel",
      displayName: "Test channel",
      subjectLabel: "Handle",
    });
    context.channels.registerDeliveryProvider({
      channelType: "test-channel",
      isAvailable: async () => true,
      send: async () => ({ status: "sent" }),
    });
  }

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.registered = true;
    context.messaging.subscribe("test:channel-ingress", async () => ({
      success: true,
    }));
  }
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
    const order: string[] = [];
    spyOn(
      shell.getEntityService(),
      "backfillMissingEmbeddings",
    ).mockImplementation(async () => {
      order.push("embeddings");
      return { queued: 0, skipped: 0 };
    });
    const original = shell
      .getEntityService()
      .reprojectRegisteredGroupings.bind(shell.getEntityService());
    spyOn(
      shell.getEntityService(),
      "reprojectRegisteredGroupings",
    ).mockImplementation(async () => {
      order.push("groupings");
      await original();
    });
    await shell.initialize();

    expect(order).toEqual(["embeddings", "groupings"]);
    expect(shell.getEntityService().areGroupingsReady()).toBe(true);
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
    const reproject = spyOn(
      shell.getEntityService(),
      "reprojectRegisteredGroupings",
    );
    await shell.initialize();
    expect(reproject).not.toHaveBeenCalled();

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

  // A background job that sends on a channel runs in the worker, so the
  // worker must know every channel's sender: an interface's channels, and
  // nothing else of it.
  it.each([
    { name: "worker", processRole: "worker", fullyRegistered: false },
    { name: "combined", processRole: undefined, fullyRegistered: true },
  ] as const)(
    "registers each interface's channels and senders: $name",
    async ({ processRole, fullyRegistered }) => {
      const directory = await createTestDirectory();
      cleanups.push(directory.cleanup);
      await Promise.all([
        migrateEntities({ url: `file:${directory.dir}/test.db` }),
        migrateJobQueue({ url: `file:${directory.dir}/test-jobs.db` }),
        migrateConversations({ url: `file:${directory.dir}/test-conv.db` }),
        migrateRuntimeState({
          url: `file:${directory.dir}/test-runtime-state.db`,
        }),
      ]);
      const logger = createSilentLogger();
      const messageBus = MessageBus.createFresh(logger);
      const daemonRegistry = DaemonRegistry.createFresh(logger);
      const channelInterface = new ChannelInterface();
      const shell = Shell.createFresh(
        createTestShellConfig(directory.dir, { plugins: [channelInterface] }),
        {
          logger,
          messageBus,
          daemonRegistry,
          jobQueueWorker: createTrackingWorker(() => {}),
        },
        processRole ? { processRole } : undefined,
      );
      shells.push(shell);
      await shell.initialize({ mode: "register-only" });

      const channels = shell.getChannelRegistry();
      expect(channels.getDescriptor("test-channel")?.displayName).toBe(
        "Test channel",
      );
      expect(
        await channels.getDeliveryProvider("test-channel")?.send({
          recipient: "someone",
          subject: "Alert",
          text: "A note arrived.",
          idempotencyKey: "alert-1",
          sensitivity: "normal",
        }),
      ).toEqual({ status: "sent" });
      expect(channelInterface.registered).toBe(fullyRegistered);
      expect(messageBus.getHandlerCount("test:channel-ingress")).toBe(
        fullyRegistered ? 1 : 0,
      );
      expect(daemonRegistry.getAll().length > 0).toBe(fullyRegistered);
    },
  );

  it.each([
    { name: "combined", mode: undefined, expected: 1 },
    { name: "registration only", mode: "register-only", expected: 0 },
    { name: "startup check", mode: "startup-check", expected: 0 },
  ] as const)(
    "runs grouping initialization only in normal serving boots: $name",
    async ({ mode, expected }) => {
      const directory = await createTestDirectory();
      cleanups.push(directory.cleanup);
      await Promise.all([
        migrateEntities({ url: `file:${directory.dir}/test.db` }),
        migrateJobQueue({ url: `file:${directory.dir}/test-jobs.db` }),
        migrateConversations({ url: `file:${directory.dir}/test-conv.db` }),
        migrateRuntimeState({
          url: `file:${directory.dir}/test-runtime-state.db`,
        }),
      ]);
      const shell = Shell.createFresh(
        createTestShellConfig(directory.dir, { plugins: [] }),
        {
          logger: createSilentLogger(),
          jobQueueWorker: createTrackingWorker(() => {}),
        },
      );
      shells.push(shell);
      const reproject = spyOn(
        shell.getEntityService(),
        "reprojectRegisteredGroupings",
      );
      await shell.initialize(mode ? { mode } : undefined);
      expect(reproject).toHaveBeenCalledTimes(expected);
      expect(shell.getEntityService().areGroupingsReady()).toBe(expected === 1);
    },
  );
});
